"""The pure half of the daily Jarvis broadcast job (record_broadcast.py): no browser, no network, no ffmpeg calls.

- concat_list():   Chrome's screencast frames (each with its wall-clock timestamp) -> an ffmpeg concat list that holds each frame for exactly as long as
                   it was on screen, cut to the broadcast's own start/end, so picture and sound line up.
- max_volume():    reads ffmpeg's volumedetect output; the job refuses to upload a silent video (the voice must be on the recording).
- title_for() / description_for(): the YouTube text. Unlisted, description only, never a forecast.
Tested in test_broadcast_core.py.
"""
from __future__ import annotations

import re
from datetime import date

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


def part_of_day(hour: int) -> str:
    """'morning' before noon, 'afternoon' before six, else 'evening' (the programme's own rule, js/terminal/broadcastCore.js partOfDay; the laptop clock is London)."""
    return 'morning' if hour < 12 else 'afternoon' if hour < 18 else 'evening'


def title_for(d: date, part: str = 'morning') -> str:
    """'H.E.L.I.X. Morning Briefing · Mon 23 Nov 2026 #Shorts' (YouTube titles are capped at 100 characters)."""
    return f"H.E.L.I.X. {part.capitalize()} Briefing · {d.strftime('%a')} {d.day} {d.strftime('%b %Y')} #Shorts"[:100]


def description_for(d: date, voice: str | None = None, seconds: float | None = None, part: str = 'morning') -> str:
    what = ("The day looked back on: the move of the day, the releases and what followed them, the markets, and tomorrow's calendar."
            if part == 'evening' else 'What markets did and how things stand.')
    parts = [
        f"The desk's {part} briefing for {d.strftime('%A')} {d.day} {d.strftime('%B %Y')}, narrated by H.E.L.I.X. (Holistic Economic Links & Intermarket Xplorer) over the desk's own hologram views.",
        '',
        what,
        '',
        'Description only. Not a forecast, not advice, not a trade.',
    ]
    meta = []
    if seconds:
        meta.append(f'{int(round(seconds))} s')
    if voice:
        meta.append(f'voice: {voice}')
    if meta:
        parts += ['', ' · '.join(meta)]
    parts += ['', '#Shorts']
    return '\n'.join(parts)[:4900]


def short_warning(seconds: float) -> str | None:
    if seconds > MAX_SHORT_SECONDS:
        return f'the video is {seconds:.0f} s, over the {MAX_SHORT_SECONDS} s Shorts limit: YouTube will file it as a normal video (it still uploads)'
    return None
