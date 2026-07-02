"""
Session Engine — daily open, Asia/London/NY levels, floor pivots, VWAP,
and historical VWAP anchor levels.

All times in UTC:
  Asia    22:00–07:00  (prior evening + early morning)
  London  07:00–13:00
  NY      13:00–20:00

VWAP Anchor Levels:
  At London and NY session opens, if the market makes a strong directional
  drive in the first hour, the opening price at that session becomes a
  "VWAP anchor" — the price level where the VWAP right-angle originated.
  These levels remain significant until price revisits them. A fib zone
  that lines up with an old VWAP anchor (especially 3–8 days old) is a
  high-conviction location because it represents an unfilled institutional
  price decision point from a prior session open.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class VwapAnchor:
    price: float         # session open price where the right-angle originated
    date: str            # 'YYYY-MM-DD'
    session: str         # 'LONDON' | 'NY'
    direction: str       # 'UP' | 'DOWN' — direction of the drive away from this level
    age_days: int
    drive_size: float    # price range of the opening drive (in gold pips/$)


@dataclass
class SessionLevels:
    current_price: float
    daily_open: float
    prev_daily_high: float
    prev_daily_low: float
    prev_daily_close: float
    asia_high: float
    asia_low: float
    asia_mid: float
    london_open: float
    london_high: float
    london_low: float
    ny_open: float
    ny_high: float
    ny_low: float
    current_session: str
    pivot: float
    r1: float; r2: float; r3: float
    s1: float; s2: float; s3: float
    vwap: float
    vwap_slope: float
    vwap_std: float
    vwap_anchors: list[VwapAnchor] = field(default_factory=list)
    today_high: float = 0.0
    today_low: float = 0.0


# ── Internal helpers ──────────────────────────────────────────────────────────

def _vwap(bars: list[dict]) -> tuple[float, float, float]:
    if not bars:
        return 0.0, 0.0, 0.0
    tpv = vol = 0.0
    tps = []
    for b in bars:
        tp = (b['high'] + b['low'] + b['close']) / 3
        v  = b.get('tick_volume', 1)
        tpv += tp * v; vol += v
        tps.append(tp)
    vwap = tpv / vol if vol else tps[-1]

    std = 0.0
    if len(tps) >= 3:
        mean = sum(tps) / len(tps)
        std  = (sum((x - mean) ** 2 for x in tps) / len(tps)) ** 0.5

    slope = 0.0
    if len(tps) >= 6:
        h = max(1, len(tps) // 4)
        slope = sum(tps[-h:]) / h - sum(tps[:h]) / h

    return round(vwap, 2), round(slope, 3), round(std, 2)


def _pivots(ph: float, pl: float, pc: float) -> dict[str, float]:
    p = (ph + pl + pc) / 3
    return {
        'pivot': round(p, 2),
        'r1': round(2 * p - pl, 2),  'r2': round(p + ph - pl, 2),
        'r3': round(ph + 2 * (p - pl), 2),
        's1': round(2 * p - ph, 2),  's2': round(p - (ph - pl), 2),
        's3': round(pl - 2 * (ph - p), 2),
    }


def _atr(bars: list[dict]) -> float:
    if len(bars) < 2:
        return 5.0
    alpha = 0.15
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return tr


# ── VWAP anchor detection ─────────────────────────────────────────────────────

# Session opens (UTC hour) to watch for right-angle drives
_SESSION_OPENS = [('LONDON', 7), ('NY', 13)]

# First N minutes of the session used to measure the opening drive
_DRIVE_BARS = 15


def compute_vwap_anchors(m1_bars: list[dict],
                         today_low: float,
                         today_high: float,
                         min_drive_atr_mult: float = 1.2,
                         max_sessions: int = 14) -> list[VwapAnchor]:
    """
    For each London and NY session open in the past N sessions, detect whether
    the market made a strong directional drive in the first _DRIVE_BARS minutes.
    The session open price = the VWAP anchor level (where the right-angle started).

    Returns only levels not yet revisited today, sorted oldest-first.

    m1_bars:       M1 bars covering past 10+ days, chronological.
    today_low/high: today's session range so far (to check if level was touched).
    max_sessions:  total number of session opens to look back through (London + NY combined).
    """
    today = datetime.now(timezone.utc).date()

    # Group M1 bars by date, skip today
    days: dict = {}
    for b in m1_bars:
        bar_date = datetime.fromtimestamp(b['time'], tz=timezone.utc).date()
        if bar_date >= today:
            continue
        days.setdefault(bar_date, []).append(b)

    sorted_dates = sorted(days.keys(), reverse=True)

    anchors: list[VwapAnchor] = []
    sessions_found = 0

    for date in sorted_dates:
        if sessions_found >= max_sessions:
            break
        day_bars = sorted(days[date], key=lambda b: b['time'])
        if len(day_bars) < 30:
            continue

        day_atr = _atr(day_bars)

        for session_name, open_hour in _SESSION_OPENS:
            # Bars at the session open hour
            drive_bars = [
                b for b in day_bars
                if datetime.fromtimestamp(b['time'], tz=timezone.utc).hour == open_hour
            ]
            if len(drive_bars) < _DRIVE_BARS:
                continue

            drive      = drive_bars[:_DRIVE_BARS]
            open_price = drive[0]['open']
            drv_high   = max(b['high'] for b in drive)
            drv_low    = min(b['low']  for b in drive)
            drive_size = drv_high - drv_low

            # Only count as a right-angle if the opening drive was strong
            if drive_size < day_atr * min_drive_atr_mult:
                sessions_found += 1
                continue

            # Direction: which way did the session drive?
            close_price = drive[-1]['close']
            direction   = 'UP' if close_price > open_price else 'DOWN'

            # Naked: today hasn't traded through the anchor level
            if not (today_low <= open_price <= today_high):
                age = (today - date).days
                anchors.append(VwapAnchor(
                    price=round(open_price, 2),
                    date=str(date),
                    session=session_name,
                    direction=direction,
                    age_days=age,
                    drive_size=round(drive_size, 1),
                ))

            sessions_found += 1

    anchors.sort(key=lambda a: a.age_days, reverse=True)   # oldest first
    return anchors


# ── Main entry point ──────────────────────────────────────────────────────────

def compute_session_levels(h1_bars: list[dict],
                           prev_daily_bar: Optional[dict],
                           current_price: float,
                           m1_bars_multiday: Optional[list[dict]] = None) -> SessionLevels:
    """
    h1_bars:           at least 48H of 1H bars, chronological.
    prev_daily_bar:    previous D1 bar (for floor pivots).
    m1_bars_multiday:  if provided, used to detect historical VWAP anchor levels.
    """
    now   = datetime.now(tz=timezone.utc)
    hour  = now.hour
    today = now.date()

    if 7 <= hour < 13:
        session = 'LONDON'
    elif 13 <= hour < 20:
        session = 'NY'
    elif hour >= 22 or hour < 7:
        session = 'ASIA'
    else:
        session = 'OFF'

    today_bars = [b for b in h1_bars
                  if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() == today]
    daily_open = today_bars[0]['open'] if today_bars else current_price

    if prev_daily_bar:
        pdh, pdl, pdc = prev_daily_bar['high'], prev_daily_bar['low'], prev_daily_bar['close']
    else:
        prev = [b for b in h1_bars
                if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() < today]
        if prev:
            pdh = max(b['high'] for b in prev[-24:])
            pdl = min(b['low']  for b in prev[-24:])
            pdc = prev[-1]['close']
        else:
            pdh = pdl = pdc = current_price

    def _range(bars, h_start, h_end):
        sel = [b for b in bars
               if h_start <= datetime.fromtimestamp(b['time'], tz=timezone.utc).hour < h_end]
        if not sel:
            return current_price, current_price, current_price
        return (max(b['high'] for b in sel),
                min(b['low']  for b in sel),
                sel[0]['open'])

    asia_late  = [b for b in h1_bars
                  if datetime.fromtimestamp(b['time'], tz=timezone.utc).hour >= 22]
    asia_early = [b for b in today_bars
                  if datetime.fromtimestamp(b['time'], tz=timezone.utc).hour < 7]
    asia_bars  = asia_late + asia_early
    ah = max((b['high'] for b in asia_bars), default=current_price)
    al = min((b['low']  for b in asia_bars), default=current_price)

    lh, ll, lo = _range(h1_bars, 7, 13)
    nh, nl, no = _range(h1_bars, 13, 20)

    pvts                      = _pivots(pdh, pdl, pdc)
    vwap, vslope, vstd        = _vwap(today_bars) if today_bars else (current_price, 0.0, 1.0)

    # Today's session range (for checking if VWAP anchor levels have been visited)
    today_high = max((b['high'] for b in today_bars), default=current_price)
    today_low  = min((b['low']  for b in today_bars), default=current_price)

    vwap_anchors: list[VwapAnchor] = []
    if m1_bars_multiday:
        vwap_anchors = compute_vwap_anchors(m1_bars_multiday, today_low, today_high)

    return SessionLevels(
        current_price=current_price,
        daily_open=round(daily_open, 2),
        prev_daily_high=round(pdh, 2), prev_daily_low=round(pdl, 2),
        prev_daily_close=round(pdc, 2),
        asia_high=round(ah, 2), asia_low=round(al, 2),
        asia_mid=round((ah + al) / 2, 2),
        london_open=round(lo, 2), london_high=round(lh, 2), london_low=round(ll, 2),
        ny_open=round(no, 2), ny_high=round(nh, 2), ny_low=round(nl, 2),
        current_session=session,
        pivot=pvts['pivot'],
        r1=pvts['r1'], r2=pvts['r2'], r3=pvts['r3'],
        s1=pvts['s1'], s2=pvts['s2'], s3=pvts['s3'],
        vwap=vwap, vwap_slope=vslope, vwap_std=vstd,
        vwap_anchors=vwap_anchors,
        today_high=round(today_high, 2),
        today_low=round(today_low, 2),
    )
