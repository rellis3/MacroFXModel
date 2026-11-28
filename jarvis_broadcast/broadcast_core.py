"""The pure half of the daily Jarvis broadcast job (record_broadcast.py): no browser, no network, no ffmpeg calls.

- concat_list():   Chrome's screencast frames (each with its wall-clock timestamp) -> an ffmpeg concat list that holds each frame for exactly as long as
                   it was on screen, cut to the broadcast's own start/end, so picture and sound line up.
- max_volume():    reads ffmpeg's volumedetect output; the job refuses to upload a silent video (the voice must be on the recording).
- voiced_problem(): every spoken line must have been voiced (a fallback browser voice is never in the recording).
- resolve_part():  which programme a run records, and the time-window guard (a late or missed run is skipped, never recorded under the wrong name).
- title_for() / description_for() / tags_for() / chapters_text() / srt_text(): the YouTube text. Unlisted, description only, never a forecast.
- loudnorm_*():    the two-pass loudness chain (-14 LUFS, -1 dBTP).  detect_problem(): freezedetect / blackdetect before upload.
- short_window():  the 45-60 s Short cut from the wide video.  desk_run_state(): is the 06:30 desk-run launcher still holding the browser profile.
- queue_*():       the upload retry queue.
Tested in test_broadcast_core.py and test_helix_extras.py.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime

MAX_SHORT_SECONDS = 180          # YouTube treats a vertical video up to 3 minutes as a Short
SILENT_DB = -50.0                # a recording whose loudest moment is quieter than this has no voice on it


def concat_list(frames: list[tuple[str, float]], t_start: float, t_end: float, min_dur: float = 1 / 120) -> tuple[str, float]:
    """frames = [(filename, wall-clock seconds), ...] in any order. Returns (ffconcat text, seconds covered).

    Frames before t_start are dropped except the last one (it is what was on screen at t_start); frames after t_end are dropped.
    Each kept frame lasts until the next one (or t_end). Raises ValueError when nothing usable is left.
    """
    if not (t_end > t_start):
        raise ValueError('the broadcast end is not after its start')
    fr = sorted(((f, t) for f, t in frames if t is not None), key=lambda x: x[1])
    before = [x for x in fr if x[1] <= t_start]
    keep = ([before[-1]] if before else []) + [x for x in fr if t_start < x[1] < t_end]
    if not keep:
        raise ValueError('no screencast frames fell inside the broadcast')
    lines, total = ['ffconcat version 1.0'], 0.0
    for i, (f, t) in enumerate(keep):
        a = max(t, t_start)
        b = keep[i + 1][1] if i + 1 < len(keep) else t_end
        d = max(min_dur, b - a)
        lines.append(f"file '{f}'")
        lines.append(f'duration {d:.6f}')
        total += d
    lines.append(f"file '{keep[-1][0]}'")          # ffconcat needs the last file repeated for its duration to count
    return '\n'.join(lines) + '\n', total


def max_volume(volumedetect_stderr: str) -> float | None:
    """'[Parsed_volumedetect_0 ...] max_volume: -3.2 dB' -> -3.2. None when absent."""
    m = re.findall(r'max_volume:\s*(-?(?:inf|\d+(?:\.\d+)?))\s*dB', volumedetect_stderr or '')
    if not m:
        return None
    v = m[-1]
    return float('-inf') if v.endswith('inf') else float(v)


def is_silent(db: float | None) -> bool:
    return db is None or db < SILENT_DB


def voiced_problem(res: dict) -> str | None:
    """0.11: the page reports how many spoken lines there were and how many were voiced. Anything under 100% is refused (the drone alone passes the -50 dB check).
    None = fine. A page too old to report the counts (no 'lines') passes, so an un-deployed site never blocks the run."""
    n, v = res.get('lines'), res.get('voiced')
    if n is None or v is None:
        return None
    if n <= 0:
        return 'the broadcast spoke no lines at all'
    if v < n:
        miss = [x.get('text', '')[:70] for x in (res.get('script') or []) if not x.get('voiced')]
        return f"only {v} of {n} lines were voiced (first missing: \"{miss[0] if miss else '?'}\"): not uploading a video with silent lines"
    return None


def part_of_day(hour: int) -> str:
    """'morning' before noon, 'afternoon' before six, else 'evening' (the programme's own rule, js/terminal/broadcastCore.js partOfDay; the laptop clock is London)."""
    return 'morning' if hour < 12 else 'afternoon' if hour < 18 else 'evening'


# ── which programme, and the time-window guard (0.15) ──
PART_TITLES = {'morning': 'Morning Briefing', 'afternoon': 'Afternoon Briefing', 'evening': 'Evening Briefing', 'weekly': 'Weekly Recap', 'special': 'Release Special', 'short': 'Short', 'guide': 'Visual Guide'}
WINDOWS = {'morning': ((6, 45), (11, 30)), 'evening': ((18, 0), (23, 59)), 'weekly': ((18, 0), (23, 59)), 'special': ((7, 0), (22, 30))}
PAGE_PROGRAMME = {'morning': ('briefing', None), 'evening': ('briefing', 'evening'), 'afternoon': ('briefing', None), 'weekly': ('weekly', 'evening'), 'special': ('special', 'evening')}


def resolve_part(now: datetime, requested: str | None = None, force: bool = False) -> tuple[str | None, str | None]:
    """(part, None) to record, or (None, why) to skip. With no --part the clock decides (morning / evening); a 07:00 run that only starts at 13:05 is NOT recorded as an
    'afternoon briefing', and a missed 21:00 run that Task Scheduler fires the next morning carries --part evening and is skipped. --force records anyway."""
    part = requested or part_of_day(now.hour)
    if force:
        return part, None
    hm = (now.hour, now.minute)
    if part not in WINDOWS:
        return None, f'{now:%H:%M} is outside the morning and evening windows (a late run is not recorded as an {part} briefing): --part and --force record anyway'
    a, b = WINDOWS[part]
    if not a <= hm <= b:
        return None, f'the {part} run started at {now:%H:%M}, outside its window {a[0]:02d}:{a[1]:02d}-{b[0]:02d}:{b[1]:02d} (a missed run is skipped, not recorded late): --force records anyway'
    if part == 'weekly' and now.weekday() != 4:
        return None, 'the weekly recap is recorded on Fridays (--force records anyway)'
    return part, None


def title_for(d: date, part: str = 'morning', headline: str | None = None) -> str:
    """'H.E.L.I.X. Morning Briefing · Mon 23 Nov 2026 #Shorts' (YouTube titles are capped at 100 characters).
    With a headline (4.6): 'H.E.L.I.X. Morning · Gold runs 2.4 times its usual · Mon 23 Nov #Shorts', the headline cut to fit."""
    name = PART_TITLES.get(part, f'{part.capitalize()} Briefing')
    if not headline:
        return f"H.E.L.I.X. {name} · {d.strftime('%a')} {d.day} {d.strftime('%b %Y')} #Shorts"[:100]
    head = re.sub(r'\s+', ' ', str(headline)).strip().rstrip('.')
    short = name.replace(' Briefing', '')
    pre, post = f'H.E.L.I.X. {short} · ', f" · {d.strftime('%a')} {d.day} {d.strftime('%b')} #Shorts"
    room = 100 - len(pre) - len(post)
    if len(head) > room:
        head = head[:max(0, room - 1)].rsplit(' ', 1)[0].rstrip(',;:') + '…'
    return f'{pre}{head}{post}'


WHAT = {
    'evening': "The day looked back on: the move of the day, the releases and what followed them, the markets, and tomorrow's calendar.",
    'weekly': "The week looked back on: the releases and what followed them, the markets, the five-day chain, and next week's calendar.",
    'special': 'A short special after a major release: what printed against what was expected, and what the markets did in the half hour after.',
}


def description_for(d: date, voice: str | None = None, seconds: float | None = None, part: str = 'morning', chapters: str = '', headline: str | None = None,
                    release: str | None = None, guide_url: str | None = None) -> str:
    """The description. 4.5: chapters from the bumper times, and no "N s · voice:" line (voice and seconds are kept as arguments for the callers, not printed)."""
    what = WHAT.get(part, 'What markets did and how things stand.')
    kind = {'weekly': 'weekly recap', 'special': 'release special'}.get(part, f'{part} briefing')
    parts = []
    if guide_url:
        parts += [f'New to the pictures? The visual guide explains each one: {guide_url}', '']
    parts += [f"The desk's {kind} for {d.strftime('%A')} {d.day} {d.strftime('%B %Y')}{f' on {release}' if release else ''}, narrated by H.E.L.I.X. (Holistic Economic Links & Intermarket Xplorer) over the desk's own hologram views."]
    if headline:
        parts += ['', f'The headline: {headline}']
    parts += ['', what, '', 'Description only. Not a forecast, not advice, not a trade.']
    if chapters:
        parts += ['', chapters]
    parts += ['', '#Shorts']
    return '\n'.join(parts)[:4900]


def short_warning(seconds: float) -> str | None:
    if seconds > MAX_SHORT_SECONDS:
        return f'the video is {seconds:.0f} s, over the {MAX_SHORT_SECONDS} s Shorts limit: YouTube will file it as a normal video (it still uploads)'
    return None


# ── tags, chapters, captions ──
TAG_NAMES = {'NQ': 'Nasdaq', 'SPX500': 'S&P 500', 'DE30': 'DAX', 'GOLD': 'gold', 'XAUUSD': 'gold', 'WTI': 'oil', 'BRENT': 'oil', 'BTCUSD': 'bitcoin', 'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD',
             'USDJPY': 'USDJPY', 'AUDUSD': 'AUDUSD', 'USDCAD': 'USDCAD', 'USDCHF': 'USDCHF', 'NZDUSD': 'NZDUSD', 'US10Y': 'Treasuries', 'VIX': 'VIX', 'DXY': 'dollar index'}


def tags_for(keys, part: str = 'morning', short: bool = False) -> list[str]:
    """4.6: the base tags plus the markets the programme named (lead and headline keys), deduped, within YouTube's 500-character budget."""
    out = ['HELIX', 'macro', 'markets', {'weekly': 'weekly recap', 'special': 'economic data'}.get(part, f'{part} briefing')]
    for k in keys or []:
        t = TAG_NAMES.get(str(k).upper(), str(k) if re.fullmatch(r'[A-Z0-9]{3,8}', str(k)) else None)
        if t and t not in out:
            out.append(t)
    if short:
        out.append('Shorts')
    while sum(len(t) + 3 for t in out) > 480:
        out.pop()
    return out


def clock(sec: float) -> str:
    s = int(max(0, sec))
    return f'{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}' if s >= 3600 else f'{s // 60}:{s % 60:02d}'


def chapters_text(marks, total: float, min_len: float = 10.0, open_title: str = 'Title') -> str:
    """4.5: YouTube chapters from the programme's marks ([{t, kind, title}], seconds from the start): the title, the headline, the lead, each segment's bumper, the sign-off.
    YouTube needs the first at 0:00, at least three, each at least 10 s long; marks closer than that are merged. '' when fewer than three survive."""
    want = []
    lead_done = False
    for m in marks or []:
        k, t = m.get('kind'), float(m.get('t') or 0)
        if k == 'open':
            name = open_title
        elif k == 'headline':
            name = 'The Headline'
        elif k == 'lead' and not lead_done:
            name, lead_done = 'The Lead', True
        elif k == 'bumper':
            name = str(m.get('title') or 'Segment')
        elif k == 'close':
            name = 'Sign-off'
        else:
            continue
        want.append((t, name))
    if not want:
        return ''
    want[0] = (0.0, want[0][1])
    keep = [want[0]]
    for t, name in want[1:]:
        if t - keep[-1][0] >= min_len:
            keep.append((t, name))
    while len(keep) > 1 and total - keep[-1][0] < min_len:
        keep.pop()
    if len(keep) < 3:
        return ''
    return '\n'.join(f'{clock(t)} {name}' for t, name in keep)


def _srt_time(s: float) -> str:
    ms = int(round(max(0.0, s) * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def srt_text(script, max_words: int = 12) -> str:
    """4.4: captions from the script timings ([{a, b, text}] seconds): each line cut into chunks of at most max_words at sentence ends, timed by word share."""
    cues = []
    for x in script or []:
        a, b, text = float(x.get('a') or 0), float(x.get('b') or 0), re.sub(r'\s+', ' ', str(x.get('text') or '')).strip()
        if not text or b <= a:
            continue
        chunks = []
        for sen in re.split(r'(?<=[.!?])\s+', text):
            w = sen.split()
            for i in range(0, len(w), max_words):
                chunks.append(' '.join(w[i:i + max_words]))
        n = sum(len(c.split()) for c in chunks) or 1
        t = a
        for c in chunks:
            d = (b - a) * len(c.split()) / n
            cues.append((t, t + d, c))
            t += d
    return ''.join(f'{i}\n{_srt_time(s)} --> {_srt_time(e)}\n{c}\n\n' for i, (s, e, c) in enumerate(cues, 1))


# ── loudness (4.2): two-pass loudnorm to -14 LUFS integrated, -1 dBTP ──
LOUD_I, LOUD_TP, LOUD_LRA = -14.0, -1.0, 11.0


def loudnorm_first() -> str:
    return f'loudnorm=I={LOUD_I}:TP={LOUD_TP}:LRA={LOUD_LRA}:print_format=json'


def loudnorm_measured(stderr: str) -> dict | None:
    """The JSON block loudnorm prints on the first pass, or None."""
    m = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', stderr or '', re.S)
    if not m:
        return None
    try:
        j = json.loads(m[-1])
        if any(str(j.get(k, '')).lstrip('-').replace('.', '', 1).isdigit() is False for k in ('input_i', 'input_tp', 'input_lra', 'input_thresh')):
            return None
        return j
    except Exception:
        return None


def loudnorm_second(m: dict | None) -> str:
    """The second pass with the measured values (linear), or a one-pass loudnorm when the first pass gave nothing usable."""
    if not m:
        return f'loudnorm=I={LOUD_I}:TP={LOUD_TP}:LRA={LOUD_LRA}'
    return (f"loudnorm=I={LOUD_I}:TP={LOUD_TP}:LRA={LOUD_LRA}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m.get('target_offset', 0)}:linear=true")


# ── freeze / black detection before upload (4.11) ──
FREEZE_MAX_S = 20.0              # a picture stuck this long is a stall (the ticker crawls all the time, so a healthy frame never repeats for long)
BLACK_MAX_SHARE = 0.25


def detect_problem(stderr: str, seconds: float) -> str | None:
    freezes = [float(x) for x in re.findall(r'freeze_duration:\s*([\d.]+)', stderr or '')]
    blacks = [float(x) for x in re.findall(r'black_duration:\s*([\d.]+)', stderr or '')]
    if freezes and max(freezes) >= FREEZE_MAX_S:
        return f'the picture froze for {max(freezes):.0f} s: not uploading. Record again.'
    if seconds > 0 and sum(blacks) / seconds >= BLACK_MAX_SHARE:
        return f'{sum(blacks) / seconds:.0%} of the video is black: not uploading. Record again.'
    return None


# ── the Short cut (4.13) ──
def short_window(marks, total: float, lo: float = 45.0, hi: float = 60.0) -> tuple[float, float] | None:
    """The 45-60 s Short from the wide video's start: the title, the headline and the lead, ending at the first segment bumper that falls in [lo, hi], else at hi.
    None when the video is shorter than lo."""
    if total < lo:
        return None
    for m in marks or []:
        t = float(m.get('t') or 0)
        if m.get('kind') == 'bumper' and lo <= t <= hi:
            return 0.0, t
    return 0.0, min(hi, total)


# ── the 06:30 desk-run launcher (4.12) ──
def desk_run_state(log_text: str, today: str) -> str:
    """'pending' while today's desk_run.py has started waiting but not yet said how it ended (it holds the browser profile for a moment once the OI pull ends),
    'done' once it has, 'none' when it has not run today."""
    lines = [x for x in (log_text or '').splitlines() if x.startswith(today)]
    if not lines:
        return 'none'
    ended = re.compile(r'\b(started|not started|FAILED)\b')
    last_wait = max((i for i, x in enumerate(lines) if 'waiting for the OI pull' in x), default=-1)
    return 'done' if any(ended.search(x) for x in lines[last_wait + 1:]) else 'pending'


# ── the upload retry queue (4.11) ──
QUEUE_MAX_TRIES = 8


def queue_push(queue: list, entry: dict, now: float) -> list:
    """Add (or refresh) a failed upload: {dir, ...}. One entry per folder."""
    q = [e for e in queue if e.get('dir') != entry.get('dir')]
    q.append({**entry, 'tries': int(entry.get('tries', 0)), 'next_at': now})
    return q


def queue_due(queue: list, now: float) -> list:
    return [e for e in queue if e.get('next_at', 0) <= now and e.get('tries', 0) < QUEUE_MAX_TRIES]


def queue_after_fail(queue: list, entry: dict, now: float) -> list:
    """Back off 15 min, 30, 1 h ... up to 6 h; dropped after QUEUE_MAX_TRIES."""
    tries = int(entry.get('tries', 0)) + 1
    q = [e for e in queue if e.get('dir') != entry.get('dir')]
    if tries < QUEUE_MAX_TRIES:
        q.append({**entry, 'tries': tries, 'next_at': now + min(6 * 3600, 900 * 2 ** (tries - 1))})
    return q


def queue_done(queue: list, entry: dict) -> list:
    return [e for e in queue if e.get('dir') != entry.get('dir')]


def podcast_id(d: date, part: str, release_key: str | None = None) -> str:
    tail = f"-{re.sub(r'[^A-Za-z0-9]+', '-', release_key).strip('-').lower()}" if release_key else ''
    return f'{d.isoformat()}-{part}{tail}'[:64]


# ── recorder robustness (27 Nov 2026: the 21:00 run failed with Page.wait_for_function timeouts while the laptop was overloaded) ──
MIN_FREE_MB = 1500               # under this much free RAM the 3D views and the frame capture starve (NinjaTrader's leak took ~18.5 GB on 26 Nov)
MAX_CPU_PCT = 85.0               # over this the page cannot load its feeds and the HUD hook in time


def machine_busy(free_mb: float | None, cpu_pct: float | None, min_free_mb: float = MIN_FREE_MB, max_cpu: float = MAX_CPU_PCT) -> str | None:
    """Why the laptop is too busy to start a recording, or None. A reading that could not be taken (None) never blocks the run."""
    why = []
    if free_mb is not None and free_mb < min_free_mb:
        why.append(f'{free_mb:,.0f} MB of RAM free (needs {min_free_mb:,.0f})')
    if cpu_pct is not None and cpu_pct > max_cpu:
        why.append(f'CPU at {cpu_pct:.0f}% (over {max_cpu:.0f}%)')
    return ' and '.join(why) or None


def backoff_s(attempt: int, base: float = 20.0, cap: float = 120.0) -> float:
    """The wait before page-load retry number `attempt` (1, 2, ...): 20 s, 40 s, 80 s, then 120 s."""
    return float(min(cap, base * 2 ** max(0, attempt - 1)))


def is_page_load_error(err: BaseException | str) -> bool:
    """A page or HUD hook that did not appear in time (worth a retry), as opposed to a logged-out profile or a voice gap (retrying would not help)."""
    s = str(err)
    if 'logged out' in s or 'VOICE_GAP' in s or 'lines were voiced' in s:
        return False
    return any(k in s for k in ('Timeout', 'timeout', 'wait_for_function', 'net::ERR', 'Navigation', 'Target closed', 'Target page, context or browser has been closed'))
