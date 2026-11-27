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
  python record_broadcast.py --youtube-auth-captions   one-off, optional: the captions sign-in (token_captions.json)
  python record_broadcast.py                    the daily run (record + upload unlisted); the clock picks morning or evening, outside their windows it is skipped
  python record_broadcast.py --part weekly --wait-busy          the Friday weekly recap (run_weekly.bat)
  python record_broadcast.py --part special --release-key K ... a release special (run_special_check.bat starts it)
  python record_broadcast.py --retry-queue      retry failed uploads (run_upload_retry.bat);  --upload-only DIR  upload one recorded folder
  python record_broadcast.py --no-upload --show record only, with the window on screen (to watch a test run)
  python record_broadcast.py --dry-run          no browser, voice, upload or note: a stand-in capture through every later step
Options: --len short|quick|full  --voice server|kokoro  --rate 1.1  --live (real-time capture)  --fps 30  --base URL  --out DIR  --no-short  --no-podcast  --force
After each upload the SERVER is told (helix_notify.py) and sends the owner's Telegram note; a failed run sends a short failure note the same way. Telegram is never sent from here.
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
from broadcast_core import (concat_list, max_volume, is_silent, title_for, description_for, short_warning, part_of_day, voiced_problem, resolve_part, PART_TITLES,  # noqa: E402
                            PAGE_PROGRAMME, tags_for, chapters_text, srt_text, loudnorm_first, loudnorm_measured, loudnorm_second, detect_problem, short_window, desk_run_state,
                            queue_push, queue_due, queue_after_fail, queue_done, QUEUE_MAX_TRIES, podcast_id)
import helix_notify  # noqa: E402

BASE = 'https://macrofxmodel-production.up.railway.app'
PROFILE = Path(os.environ.get('JARVIS_PROFILE', HERE / '.profile'))                     # the saved, logged-in browser profile (git-ignored)
OUT = HERE / 'out'                              # recordings and logs (git-ignored)
W, H, DPR = 1600, 900, 1                        # WIDE: drawn at 1600x900 and scaled to 1080p when encoded (25 Nov 2026: 40% faster on the laptop's Intel GPU, 4.8 vs 3.4 frames/s in the 3D scenes)
OUT_W, OUT_H = 1920, 1080                       # the video's size
# WIDE (the default from 25 Nov 2026, owner: "the full brief wider in a professional setting"): the desk layout at 1920 x 1080
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


def wait_desk_run(page, limit_s: int = 720):
    """The morning brief leads with the desk run's call: if one is still running (desk_run.py starts it after the OI pull), wait for it, up to 12 minutes."""
    t0 = time.time()
    while time.time() - t0 < limit_s:
        st = page.evaluate("() => fetch('/api/desk-run/status').then(r => r.json()).catch(() => null)") or {}
        job = st.get('job') or {}
        if job.get('status') != 'running':
            if time.time() - t0 > 1:
                log(f"desk run finished ({job.get('status')}) after {time.time() - t0:.0f} s of waiting")
            return
        if time.time() - t0 < 1:
            log(f"a desk run is still running ({job.get('stage', '')}): waiting for it, up to {limit_s // 60} min")
        time.sleep(15)
    log('desk run still running after 12 min: recording without it (the brief falls back to Bias Engine V2)')


def voice_plain(page):
    """The voice as it is, no robot finish (owner, 25 Nov 2026: "just Daniel, without the robotic twang")."""
    page.evaluate("() => { try { const k = 'jarvisVoice:v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), fx: 'off' })); } catch (e) {} }")


def record_frames(base: str, length: str, engine: str, visible: bool, out_dir: Path, rate: float = 1.1, fps: int = 30, prog: dict | None = None) -> dict:
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
        if (prog or {}).get('part', part_of_day(datetime.now().hour)) == 'morning':
            if length != 'guide':          # the visual guide explains the pictures; it does not need today's desk run
                wait_desk_run(page)
        voice_plain(page)
        page.evaluate('() => window.__vclock.freeze()')
        page.evaluate("""o => { window.__vcRes = null; window.__vcOnAir = 0;
            window.__jarvisBroadcastAuto(o).then(r => { window.__vcRes = r; }, e => { window.__vcRes = { ok: false, error: String(e && e.message || e) }; }); }""",
                      {'len': length, 'engine': engine, 'rate': rate, 'budgetSec': FRAMES_SHORT_SEC, **(prog or {}).get('page', {})})
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
    log(f"captured {len(frames)} frames and {audio.stat().st_size // 1024} KB of sound over {t1 - t0:.1f} s in {time.time() - started:.0f} s; voice: {res.get('voice')} ({((res.get('voiceInfo') or {}).get('server') or {}).get('provider') or '?'}, no robot finish); voiced {res.get('voiced', '?')} of {res.get('lines', '?')} lines")
    if res.get('voiceForced'):
        log(f"voice: {res['voiceForced']}")
    why = voiced_problem(res)
    if why:
        raise RuntimeError(why)
    return {'work': work, 'frames': frames, 'audio': audio, 't0': t0, 't1': t1, 'voice': res.get('voice'), 'log': {k: res.get(k) for k in LOG_KEYS}}


def record(base: str, length: str, engine: str, visible: bool, out_dir: Path, rate: float = 1.1, prog: dict | None = None) -> dict:
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
        res = page.evaluate('o => window.__jarvisBroadcastAuto(o)', {'len': length, 'engine': engine, 'rate': rate, **(prog or {}).get('page', {})})
        time.sleep(0.5)
        cdp.send('Page.stopScreencast')
        ctx.close()
    if not res or not res.get('ok'):
        raise RuntimeError(f'the broadcast did not run: {res}')
    ext = 'ogg' if 'ogg' in res['mime'] else 'wav' if 'wav' in res['mime'] else 'webm'
    audio = work / f'audio.{ext}'
    audio.write_bytes(base64.b64decode(res['audio']))
    t0, t1 = res['t0'] / 1000.0, res['t1'] / 1000.0
    log(f"captured {len(frames)} frames and {audio.stat().st_size // 1024} KB of sound over {t1 - t0:.1f} s; voice: {res.get('voice')}; voiced {res.get('voiced', '?')} of {res.get('lines', '?')} lines")
    why = voiced_problem(res)
    if why:
        raise RuntimeError(why)
    return {'work': work, 'frames': frames, 'audio': audio, 't0': t0, 't1': t1, 'voice': res.get('voice'), 'log': {k: res.get(k) for k in LOG_KEYS}}


def washed_share(ff: str, mp4: Path, every: float = 4.0) -> float:
    """Share of sampled frames that are washed out (mean brightness over 150 of 255). The HELIX pictures are dark;
    26 Nov 2026 a guide uploaded with every 3D view rendered white (the browser's GPU drawing failed mid-run, no error logged)."""
    w, h = 32, 18
    r = subprocess.run([ff, '-loglevel', 'error', '-i', str(mp4), '-vf', f'fps=1/{every},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True)
    raw, n = r.stdout, w * h
    frames = [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]
    if not frames:
        return 0.0
    return sum(1 for f in frames if sum(f) / n > 150) / len(frames)


def encode(cap: dict, part: str | None = None) -> Path:
    ff = ffmpeg_exe()
    work = cap['work']
    text, secs = concat_list(cap['frames'], cap['t0'], cap['t1'])
    (work / 'frames' / 'list.ffconcat').write_text(text, encoding='utf-8')
    mp4 = work / f"jarvis-{part or part_of_day(datetime.now().hour)}-{work.name[:10]}.mp4"
    cap['audioNorm'] = loudnorm_audio(ff, Path(cap['audio']), work / 'audio-norm.wav')      # 4.2: -14 LUFS / -1 dBTP, two passes
    vf = f'scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease:flags=lanczos,pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p'
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(work / 'frames' / 'list.ffconcat'),
           '-i', str(cap['audioNorm']), '-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',   # veryfast: 2 min not 15 on the laptop (24 Nov 2026), same crf; YouTube re-encodes anyway
           '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{secs:.3f}', '-movflags', '+faststart', str(mp4)]
    subprocess.run(cmd, check=True)
    # the voice must be on it: refuse a silent recording
    r = subprocess.run([ff, '-hide_banner', '-i', str(mp4), '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    db = max_volume(r.stderr)
    log(f'encoded {mp4.name}: {secs:.1f} s, loudest moment {db} dB')
    if is_silent(db):
        raise RuntimeError(f'the recording has no sound on it (loudest {db} dB): not uploading. Check the voice (H.E.L.I.X. OPTIONS / /api/jarvis/voice/info).')
    ws = washed_share(ff, mp4)
    log(f'washed-out frames: {ws:.0%}')
    if ws > 0.15:
        raise RuntimeError(f'{ws:.0%} of the frames are washed out (the 3D views rendered white): not uploading. Record again.')
    detect_check(ff, mp4, secs)                          # 4.11: a frozen or black picture is not uploaded
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


def end_stuck_run(out_dir: Path) -> None:
    """One recorder at a time (25 Nov 2026: a stopped evening task left its recorder alive, holding the browser profile, so the restart fell back to the live way twice).
    The running recorder writes its process id to out/recorder.pid; a new run ends that process tree (by id, only if it is still a record_broadcast run) before it starts."""
    pid_file = out_dir / 'recorder.pid'
    try:
        old = int(pid_file.read_text().strip()) if pid_file.exists() else 0
    except Exception:
        old = 0
    if old and old != os.getpid():
        try:
            q = subprocess.run(['powershell', '-NoProfile', '-Command', f'(Get-CimInstance Win32_Process -Filter "ProcessId={old}").CommandLine'], capture_output=True, text=True, timeout=30)
            if 'record_broadcast' in (q.stdout or '') and ('--part special' in q.stdout or '--part weekly' in q.stdout):
                # a release special or the weekly recap is a live, healthy run (not a stuck one): the briefing waits for it, up to 45 minutes, then ends it
                log(f'a {"special" if "--part special" in q.stdout else "weekly recap"} (process {old}) is still recording: waiting for it, up to 45 min')
                t0 = time.time()
                while time.time() - t0 < 45 * 60 and recorder_alive(out_dir):
                    time.sleep(20)
                q = subprocess.run(['powershell', '-NoProfile', '-Command', f'(Get-CimInstance Win32_Process -Filter "ProcessId={old}").CommandLine'], capture_output=True, text=True, timeout=30)
            if 'record_broadcast' in (q.stdout or ''):
                log(f'an earlier recorder (process {old}) is still running: ending it and its browser first')
                subprocess.run(['taskkill', '/PID', str(old), '/T', '/F'], capture_output=True, timeout=60)
                time.sleep(5)
        except Exception as e:
            log(f'could not check the earlier recorder ({e}); carrying on')
    out_dir.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(str(os.getpid()))


def keep_awake(on: bool) -> None:
    """4.10: keep the laptop (and its display: the browser must draw) awake for the run; released at the end. Windows only, harmless elsewhere."""
    try:
        import ctypes
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED, ES_DISPLAY_REQUIRED = 0x80000000, 0x00000001, 0x00000002
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | (ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED if on else 0))
    except Exception:
        pass


def wait_desk_launcher(out_dir: Path, until=(7, 25)) -> None:
    """4.12: the 06:30 desk-run launcher (desk_run.py) opens the same browser profile for a moment once the OI pull ends (up to 07:20). If it is still waiting, wait for it,
    so the recorder never takes the profile first (the launcher would then fail and the paid run would not start, or the recorder would fall back to live)."""
    f = out_dir / 'desk_run.log'
    today = datetime.now().strftime('%Y-%m-%d')
    noted = False
    while True:
        try:
            st = desk_run_state(f.read_text(encoding='utf-8', errors='replace') if f.exists() else '', today)
        except OSError:
            st = 'none'
        if st != 'pending' or (datetime.now().hour, datetime.now().minute) >= until:
            if noted:
                log(f'desk-run launcher: {st}; recording now')
            return
        if not noted:
            log('the desk-run launcher has not started the desk run yet (it needs the browser profile for a moment): waiting for it, up to 07:25')
            noted = True
        time.sleep(15)


def recorder_alive(out_dir: Path) -> int:
    """The process id of a running recorder (out/recorder.pid, only if that process is still a record_broadcast run), else 0."""
    pid_file = out_dir / 'recorder.pid'
    try:
        old = int(pid_file.read_text().strip()) if pid_file.exists() else 0
    except Exception:
        return 0
    if not old or old == os.getpid():
        return 0
    try:
        q = subprocess.run(['powershell', '-NoProfile', '-Command', f'(Get-CimInstance Win32_Process -Filter "ProcessId={old}").CommandLine'], capture_output=True, text=True, timeout=30)
        return old if 'record_broadcast' in (q.stdout or '') else 0
    except Exception:
        return 0


def wait_for_recorder(out_dir: Path, limit_s: int = 90 * 60) -> None:
    """The extra programmes (weekly recap, release special) QUEUE behind a running recorder instead of ending it (end_stuck_run is for the scheduled briefings)."""
    t0 = time.time()
    while True:
        pid = recorder_alive(out_dir)
        if not pid:
            break
        if time.time() - t0 > limit_s:
            raise RuntimeError(f'another recorder (process {pid}) is still running after {limit_s // 60} min: not starting')
        if time.time() - t0 < 1:
            log(f'another recorder (process {pid}) is running: waiting for it to finish')
        time.sleep(30)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'recorder.pid').write_text(str(os.getpid()))


def loudnorm_audio(ff: str, src: Path, dst: Path) -> Path:
    """4.2: two-pass loudnorm to -14 LUFS / -1 dBTP (the bus limiter keeps peaks in; this sets the level YouTube and podcast apps expect). Falls back to the raw audio on error."""
    try:
        r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', str(src), '-af', loudnorm_first(), '-f', 'null', '-'], capture_output=True, text=True, timeout=600)
        m = loudnorm_measured(r.stderr)
        subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), '-af', loudnorm_second(m), '-ar', '48000', '-ac', '1', str(dst)], check=True, timeout=600)
        log(f"loudness: {m.get('input_i') if m else '?'} LUFS measured, normalised to -14 LUFS / -1 dBTP ({'two passes' if m else 'one pass'})")
        return dst
    except Exception as e:
        log(f'loudness normalisation failed ({e}); using the audio as recorded')
        return src


def detect_check(ff: str, mp4: Path, seconds: float) -> None:
    """4.11: freezedetect / blackdetect before upload; a long freeze or a mostly black video is refused."""
    r = subprocess.run([ff, '-hide_banner', '-nostats', '-i', str(mp4), '-vf', 'fps=10,scale=320:-2,freezedetect=n=-60dB:d=8,blackdetect=d=3:pic_th=0.98:pix_th=0.02',
                        '-an', '-f', 'null', '-'], capture_output=True, text=True, timeout=900)
    why = detect_problem(r.stderr, seconds)
    if why:
        raise RuntimeError(why)


def make_thumbnail(ff: str, mp4: Path, t: float, out: Path) -> Path | None:
    """4.6: one frame of the headline card (a few seconds in, once its words are up) as a 1280-wide JPEG."""
    try:
        subprocess.run([ff, '-y', '-loglevel', 'error', '-ss', f'{max(0.0, t):.2f}', '-i', str(mp4), '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', str(out)], check=True, timeout=120)
        return out if out.exists() and out.stat().st_size > 2000 else None
    except Exception as e:
        log(f'thumbnail not made ({e})')
        return None


def make_short(ff: str, mp4: Path, window: tuple[float, float], out: Path) -> Path:
    """4.13: the 45-60 s Short: the wide video's opening (title, headline, lead) reframed to 1080x1920, the picture centred over a blurred copy of itself."""
    a, b = window
    vf = ('[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28,eq=brightness=-0.12[bg];'
          '[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]')
    af = f'afade=t=out:st={max(0.0, b - a - 0.8):.2f}:d=0.8'
    subprocess.run([ff, '-y', '-loglevel', 'error', '-ss', f'{a:.2f}', '-t', f'{b - a:.2f}', '-i', str(mp4), '-filter_complex', vf, '-map', '[v]', '-map', '0:a:0', '-af', af,
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(out)], check=True, timeout=900)
    return out


def make_mp3(ff: str, audio: Path, out: Path) -> Path:
    """4.13: the podcast episode: the loudnormed sound as a 96 kbit/s mono MP3."""
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(audio), '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', '-ar', '44100', str(out)], check=True, timeout=600)
    return out


LOG_KEYS = ('lines', 'voiced', 'marks', 'script', 'programme', 'headline', 'keys', 'voiceForced')


def build_meta(cap: dict, mp4: Path, part: str, fmt: str, rel: dict | None, guide_url: str | None) -> dict:
    """Everything the upload needs, written to the run folder as meta.json (so --upload-only and the retry queue can publish it later)."""
    today = datetime.now().date()
    lg = cap.get('log') or {}
    secs = cap.get('seconds') or 0
    rel_name = (rel or {}).get('name')
    head = lg.get('headline') if part in ('morning', 'evening', 'afternoon', 'weekly') else None
    title = title_for(today, part, head)
    if part == 'special' and rel_name:
        title = title_for(today, 'special', f"{(rel or {}).get('ccy', '')} {rel_name}".strip())
    if fmt != 'short':
        title = title.replace(' #Shorts', '')
    chapters = chapters_text(lg.get('marks'), secs, open_title=PART_TITLES.get(part, 'Title'))
    desc = description_for(today, cap.get('voice'), secs, part, chapters=chapters, headline=head, release=rel_name, guide_url=guide_url)
    if fmt != 'short':
        desc = desc.replace('\n\n#Shorts', '')
    srt = mp4.with_suffix('.srt')
    if lg.get('script'):
        srt.write_text(srt_text(lg['script']), encoding='utf-8')
    head_mark = next((m['t'] for m in lg.get('marks') or [] if m.get('kind') == 'headline'), None)
    return {'part': part, 'format': fmt, 'title': title, 'description': desc, 'tags': tags_for(lg.get('keys'), part, fmt == 'short'), 'mp4': str(mp4), 'seconds': round(secs, 1),
            'srt': str(srt) if srt.exists() else None, 'thumbAt': (head_mark + 4.0) if head_mark is not None else None, 'marks': lg.get('marks') or [],
            'releaseKey': (rel or {}).get('key'), 'audio': str(cap.get('audioNorm') or ''), 'voice': cap.get('voice'), 'date': today.isoformat()}


def publish(meta: dict, base: str, out_dir: Path, *, short_cut: bool = True, podcast: bool = True, dry: bool = False) -> dict:
    """Upload the video (unlisted), tell the server (the Telegram note), then the extras: captions, thumbnail, the podcast episode, the Short. Only the video upload can fail the
    run; each extra is best effort and logged. In --dry-run nothing leaves the laptop: the uploads and the notes are logged with fake ids."""
    ff = ffmpeg_exe()
    mp4, part, fmt = Path(meta['mp4']), meta['part'], meta['format']
    if dry:
        vid = 'DRYRUN00001'
        log(f"[dry run] would upload {mp4.name} as unlisted: {meta['title']!r} ({len(meta['tags'])} tags, {len(meta['description'])} chars of description)")
    else:
        from youtube_upload import upload
        vid = upload(mp4, meta['title'], meta['description'], privacy='unlisted', tags=meta['tags'])
    url = f'https://youtube.com/shorts/{vid}' if fmt == 'short' else f'https://youtu.be/{vid}'
    log(f'uploaded (unlisted): {url}')
    res = {'videoId': vid, 'url': url, 'privacy': 'unlisted', 'format': fmt}
    note = (lambda *a, **k: log(f'[dry run] would notify the server: {a[1:3]}') or True) if dry else helix_notify.notify_published
    if not note(base, vid, meta['title'], part, meta.get('seconds'), fmt, meta.get('releaseKey'), log=log):
        log('the server could not be told (no Telegram note); the video is up regardless')
    if not dry:
        try:
            import youtube_upload as yu
            if meta.get('srt') and yu.captions_ready():
                yu.upload_captions(vid, Path(meta['srt']))
                log('captions uploaded')
            elif meta.get('srt'):
                log('captions skipped: no captions sign-in (python record_broadcast.py --youtube-auth-captions)')
            if meta.get('thumbAt') is not None:
                jpg = make_thumbnail(ff, mp4, meta['thumbAt'], mp4.with_suffix('.jpg'))
                if jpg:
                    yu.set_thumbnail(vid, jpg)
                    log('thumbnail set from the headline card')
        except Exception as e:
            log(f'captions/thumbnail not set ({e}); the video is up regardless')
    elif meta.get('thumbAt') is not None:
        jpg = make_thumbnail(ff, mp4, meta['thumbAt'], mp4.with_suffix('.jpg'))
        log(f'[dry run] thumbnail {"made" if jpg else "NOT made"}; captions {"written" if meta.get("srt") else "none"}')
    # the podcast episode (audio only, private feed): every wide briefing, recap and special
    if podcast and fmt == 'wide' and part in ('morning', 'evening', 'weekly', 'special') and meta.get('audio') and Path(meta['audio']).exists():
        try:
            mp3 = make_mp3(ff, Path(meta['audio']), mp4.with_suffix('.mp3'))
            ep = podcast_id(datetime.fromisoformat(meta['date']).date(), part, meta.get('releaseKey'))
            if dry:
                log(f'[dry run] would upload podcast episode {ep} ({mp3.stat().st_size // 1024} KB)')
            else:
                j = helix_notify.upload_podcast(base, mp3, ep, meta['title'], part, meta.get('seconds'), log=log)
                log(f"podcast episode {ep}: {'published' if j and j.get('ok') else 'not published'} {(j or {}).get('error', '')}".rstrip())
        except Exception as e:
            log(f'podcast episode not made ({e})')
    # the Short: the morning's opening minute, reframed for the phone
    if short_cut and fmt == 'wide' and part == 'morning':
        try:
            win = short_window(meta.get('marks'), meta.get('seconds') or 0)
            if win:
                sp = make_short(ff, mp4, win, mp4.with_name(mp4.stem + '-short.mp4'))
                d = datetime.fromisoformat(meta['date']).date()
                sm = {**meta, 'part': 'short', 'format': 'short', 'mp4': str(sp), 'seconds': round(win[1] - win[0], 1), 'srt': None, 'thumbAt': None, 'releaseKey': None,
                      'title': title_for(d, 'short', meta['title'].split(' · ')[1] if meta['title'].count(' · ') >= 2 else None),
                      'description': description_for(d, part='morning') + '', 'tags': meta['tags'] + ['Shorts']}
                (sp.parent / 'meta-short.json').write_text(json.dumps(sm, indent=2), encoding='utf-8')
                res['short'] = publish(sm, base, out_dir, short_cut=False, podcast=False, dry=dry)
            else:
                log('no Short: the video is under 45 s')
        except Exception as e:
            log(f'the Short was not made or uploaded ({e})')
    return res


QUEUE = 'upload_queue.json'


def read_queue(out_dir: Path) -> list:
    try:
        return json.loads((out_dir / QUEUE).read_text(encoding='utf-8'))
    except Exception:
        return []


def drain_queue(base: str, out_dir: Path) -> int:
    """4.11: retry the uploads that failed (out/upload_queue.json), with a back-off. Each success sends its Telegram note as usual."""
    q = read_queue(out_dir)
    due = queue_due(q, time.time())
    if not due:
        log(f'upload queue: nothing due ({len(q)} waiting)')
        return 0
    for e in due:
        meta_file = Path(e['dir']) / e.get('meta', 'meta.json')
        try:
            meta = json.loads(meta_file.read_text(encoding='utf-8'))
            log(f"upload queue: retrying {meta_file.parent.name} (try {e.get('tries', 0) + 1})")
            publish(meta, base, out_dir)
            q = queue_done(q, e)
        except Exception as x:
            log(f'upload queue: {meta_file.parent.name} failed again ({x})')
            q = queue_after_fail(q, e, time.time())
            if e.get('tries', 0) + 1 >= QUEUE_MAX_TRIES:
                helix_notify.notify_failed(base, e.get('part', 'morning'), f'the upload failed {QUEUE_MAX_TRIES} times and was given up: {x}', log=log)
    (out_dir / QUEUE).write_text(json.dumps(q, indent=2), encoding='utf-8')
    return 0


def dry_capture(out_dir: Path, seconds: float = 70.0) -> dict:
    """--dry-run: a stand-in capture made with ffmpeg (a test pattern and a tone, no browser, no voice call), with marks and a script shaped like the page's, so every step
    after recording (concat, loudness, freeze/black checks, chapters, captions, thumbnail, the Short, the MP3) runs for real."""
    ff = ffmpeg_exe()
    work = out_dir / f"{datetime.now().strftime('%Y-%m-%d_%H%M')}-dry"
    frames_dir = work / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'testsrc2=size={W}x{H}:rate=5:duration={seconds}', '-q:v', '4', str(frames_dir / 'f%06d.jpg')], check=True)
    subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'sine=frequency=220:duration={seconds}:sample_rate=48000', '-af', 'volume=0.2', str(work / 'audio.wav')], check=True)
    names = sorted(p.name for p in frames_dir.glob('f*.jpg'))
    t0 = 1000.0
    frames = [(n, t0 + i / 5) for i, n in enumerate(names)]
    marks = [{'t': 0, 'kind': 'open', 'title': 'THE MORNING BRIEFING'}, {'t': 6, 'kind': 'headline', 'title': 'The Headline'}, {'t': 16, 'kind': 'lead', 'title': 'The Lead'},
             {'t': 30, 'kind': 'lead', 'title': 'The Lead'}, {'t': 48, 'kind': 'bumper', 'title': 'Markets'}, {'t': 51, 'kind': 'scene', 'title': 'Board'}, {'t': 63, 'kind': 'close', 'title': 'Sign-off'}]
    script = [{'a': 0.5, 'b': 5.5, 'text': 'Good morning. This is Helix, with the morning briefing.', 'voiced': True},
              {'a': 6.5, 'b': 15, 'text': 'The headline: gold runs 2.4 times its usual move.', 'voiced': True},
              {'a': 16.5, 'b': 47, 'text': 'Three stories lead this morning. First, gold. Second, the yen. And third, oil.', 'voiced': True},
              {'a': 51, 'b': 62, 'text': 'Markets: nine of fifteen are moving more than usual.', 'voiced': True}, {'a': 63, 'b': 68, 'text': 'That is the briefing.', 'voiced': True}]
    log(f'[dry run] stand-in capture: {len(frames)} frames, {seconds:.0f} s of tone (no browser, no voice call)')
    return {'work': work, 'frames': frames, 'audio': work / 'audio.wav', 't0': t0, 't1': t0 + seconds, 'voice': 'dry run',
            'log': {'lines': len(script), 'voiced': len(script), 'marks': marks, 'script': script, 'programme': 'briefing', 'headline': 'Gold runs 2.4 times its usual move', 'keys': ['GOLD', 'USDJPY', 'WTI']}}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--login', action='store_true', help='one-off: log into the desk site in a visible window')
    ap.add_argument('--youtube-auth', action='store_true', help='one-off: sign in to YouTube and save token.json')
    ap.add_argument('--youtube-auth-captions', action='store_true', help='one-off: a second sign-in with the captions permission (youtube.force-ssl), saved as token_captions.json')
    ap.add_argument('--no-upload', action='store_true', help='record and encode only')
    ap.add_argument('--show', action='store_true', help='keep the browser window on screen')
    ap.add_argument('--format', choices=['wide', 'short'], default='wide', help='wide (default): 1920x1080, the full programme, a normal video; short: 1080x1920 under 3 min, a YouTube Short')
    ap.add_argument('--len', choices=['short', 'quick', 'full', 'guide'], default=None, help='the programme cut (default: quick for wide, short for a Short)')
    ap.add_argument('--voice', choices=['server', 'kokoro'], default='server', help='server (steady) or kokoro (open-source, needs a fast machine)')
    ap.add_argument('--rate', type=float, choices=[0.9, 1.0, 1.1, 1.15, 1.3], default=1.1, help='voice speed: 0.9 calm, 1 normal, 1.1 steady (default), 1.15 brisk, 1.3 fast')
    ap.add_argument('--live', action='store_true', help='record in real time (the old way; drops frames on a busy machine)')
    ap.add_argument('--frames', action='store_true', help='record frame by frame (the morning default)')
    ap.add_argument('--fps', type=int, choices=[24, 25, 30], default=30, help='frame-by-frame: frames per second (default 30)')
    ap.add_argument('--part', choices=['morning', 'evening', 'weekly', 'special'], default=None, help='the programme (default: the clock, morning or evening); a run outside its window is skipped')
    ap.add_argument('--force', action='store_true', help='record even outside the time window')
    ap.add_argument('--release-key', default=None, help='special: the release key from /api/helix/special-due (one special per release)')
    ap.add_argument('--release-name', default=None, help='special: the release, e.g. "Non-Farm Employment Change"')
    ap.add_argument('--release-ccy', default=None, help='special: its currency, e.g. USD')
    ap.add_argument('--release-hm', default=None, help='special: its London time, e.g. 13:30')
    ap.add_argument('--wait-busy', action='store_true', help='queue behind a running recorder instead of ending it (the weekly recap and the specials)')
    ap.add_argument('--upload-only', default=None, metavar='DIR', help='upload the video already in DIR (its meta.json), with its notes and extras')
    ap.add_argument('--retry-queue', action='store_true', help='retry the failed uploads in out/upload_queue.json, then exit')
    ap.add_argument('--no-short', action='store_true', help='do not cut and upload the 45-60 s Short from the morning video')
    ap.add_argument('--no-podcast', action='store_true', help='do not publish the audio as a podcast episode')
    ap.add_argument('--dry-run', action='store_true', help='no browser, no voice, no upload, no notes: a stand-in capture through every later step (to test the pipeline)')
    ap.add_argument('--base', default=os.environ.get('JARVIS_SITE', BASE))
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args()
    global W, H, DPR
    global OUT_W, OUT_H
    if a.format == 'short':
        W, H, DPR = SHORT_PAGE
        OUT_W, OUT_H = W * DPR, H * DPR
    if a.len is None:
        a.len = 'short' if a.format == 'short' or a.part == 'special' else 'quick'
    if a.login:
        return do_login(a.base)
    if a.youtube_auth or a.youtube_auth_captions:
        import youtube_upload as yu
        if a.youtube_auth_captions:
            yu.authorise(interactive=True, token=yu.TOKEN_CAPTIONS, scopes=yu.SCOPES_CAPTIONS)
        else:
            yu.authorise(interactive=True)
        print('YouTube sign-in saved.')
        return
    out_dir = Path(a.out)
    if a.retry_queue:
        sys.exit(drain_queue(a.base, out_dir))
    if a.upload_only:
        meta = json.loads((Path(a.upload_only) / 'meta.json').read_text(encoding='utf-8'))
        try:
            res = publish(meta, a.base, out_dir, short_cut=not a.no_short, podcast=not a.no_podcast, dry=a.dry_run)
            (out_dir / 'last_run.json').write_text(json.dumps({'ok': True, 'uploadOnly': True, **res}, indent=2), encoding='utf-8')
        except Exception as e:
            log(f'FAILED (upload only): {e}')
            sys.exit(1)
        return
    now = datetime.now()
    if a.len == 'guide':
        part = 'guide'
    else:
        part, why = resolve_part(now, a.part, a.force or a.dry_run)
        if not part:
            log(f'skipped: {why}')
            (out_dir / 'last_run.json').write_text(json.dumps({'ok': True, 'skipped': why, 'at': now.isoformat(timespec='seconds')}, indent=2), encoding='utf-8')
            return
    programme, pod = PAGE_PROGRAMME.get(part, ('briefing', None))
    rel = {'key': a.release_key, 'name': a.release_name, 'ccy': (a.release_ccy or '').upper() or None, 'hm': a.release_hm} if part == 'special' else None
    page = {'programme': programme, 'pod': pod, 'release': ({k: rel[k] for k in ('name', 'ccy', 'hm')} if rel else None), 'chainWin': 5 if part == 'weekly' else None}
    prog = {'part': part, 'page': page}
    notify = not a.no_upload and not a.dry_run
    keep_awake(True)
    try:
        if a.wait_busy:
            wait_for_recorder(out_dir)
        else:
            end_stuck_run(out_dir)
        if part == 'morning' and not a.dry_run:
            wait_desk_launcher(out_dir)
        if a.dry_run:
            cap = dry_capture(out_dir)
            mp4 = encode(cap, part)
        elif a.live:
            cap = record(a.base, a.len, a.voice, a.show, out_dir, a.rate, prog)
            mp4 = encode(cap, part)
        else:
            try:
                cap = record_frames(a.base, a.len, a.voice, a.show, out_dir, a.rate, a.fps, prog)
                mp4 = encode(cap, part)
            except Exception as e:                  # a video beats none: fall back to the live recording (but not when a line could not be voiced: live would be silent there too)
                if 'VOICE_GAP' in str(e) or 'lines were voiced' in str(e):
                    raise
                log(f'frame-by-frame failed ({e}); recording live instead')
                a.live = True
                cap = record(a.base, a.len, a.voice, a.show, out_dir, a.rate, prog)
                mp4 = encode(cap, part)
        result = {'ok': True, 'mode': 'dry' if a.dry_run else 'live' if a.live else 'frames', 'part': part, 'file': str(mp4), 'seconds': round(cap['seconds'], 1), 'voice': cap['voice'],
                  'voiced': f"{(cap.get('log') or {}).get('voiced', '?')}/{(cap.get('log') or {}).get('lines', '?')}", 'at': datetime.now().isoformat(timespec='seconds')}
        guide_file = out_dir / 'guide_url.txt'          # the visual guide's link, kept by the guide run and put in every brief's description
        if a.len == 'guide':
            meta = {'part': 'guide', 'format': a.format, 'title': 'H.E.L.I.X. Visual Guide · how to read the briefings', 'mp4': str(mp4), 'seconds': round(cap['seconds'], 1),
                    'description': ('Every picture in the H.E.L.I.X. morning and evening briefings: what it shows and how to read it. '
                                    'The briefings themselves skip the explanations and go straight to the analysis; keep this one for reference.\n\n'
                                    'Description only. Not a forecast, not advice, not a trade.'),
                    'tags': tags_for([], 'guide'), 'srt': None, 'thumbAt': None, 'marks': [], 'releaseKey': None, 'audio': '', 'date': datetime.now().date().isoformat()}
        else:
            gu = guide_file.read_text(encoding='utf-8').strip() if guide_file.exists() else None
            meta = build_meta(cap, mp4, part, a.format, rel, gu)
        (cap['work'] / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
        if not a.no_upload:
            try:
                res = publish(meta, a.base, out_dir, short_cut=not a.no_short, podcast=not a.no_podcast, dry=a.dry_run)
            except Exception as e:                  # the video is made: queue it for another try instead of losing it
                if not a.dry_run:
                    (out_dir / QUEUE).write_text(json.dumps(queue_push(read_queue(out_dir), {'dir': str(cap['work']), 'meta': 'meta.json', 'part': part}, time.time()), indent=2), encoding='utf-8')
                raise RuntimeError(f'the upload failed ({e}); queued for a retry (run_upload_retry.bat)') from e
            result.update(res)
            if a.len == 'guide' and not a.dry_run:
                guide_file.write_text(res['url'], encoding='utf-8')
        (out_dir / 'last_run.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        if not a.dry_run:
            keep_last(out_dir, 9)
    except Exception as e:
        log(f'FAILED: {e}')
        (out_dir / 'last_run.json').write_text(json.dumps({'ok': False, 'part': part, 'error': str(e), 'at': datetime.now().isoformat(timespec='seconds')}, indent=2), encoding='utf-8')
        if notify and part != 'guide':
            helix_notify.notify_failed(a.base, part, str(e), log=log)       # the server sends the short failure note; a failed notify is only logged
        sys.exit(1)
    finally:
        keep_awake(False)


if __name__ == '__main__':
    main()
