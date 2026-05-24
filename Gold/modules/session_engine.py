"""
Session Engine — daily open, Asia/London/NY levels, floor pivots, session VWAP.

All times in UTC:
  Asia    22:00–07:00  (prior evening + early morning)
  London  07:00–13:00
  NY      13:00–20:00
"""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


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
    current_session: str   # ASIA | LONDON | NY | OFF
    pivot: float
    r1: float; r2: float; r3: float
    s1: float; s2: float; s3: float
    vwap: float
    vwap_slope: float
    vwap_std: float


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
        h = len(tps) // 4
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


def compute_session_levels(h1_bars: list[dict], prev_daily_bar: Optional[dict],
                           current_price: float) -> SessionLevels:
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

    # Asia wraps midnight
    asia_late  = [b for b in h1_bars
                  if datetime.fromtimestamp(b['time'], tz=timezone.utc).hour >= 22]
    asia_early = [b for b in today_bars
                  if datetime.fromtimestamp(b['time'], tz=timezone.utc).hour < 7]
    asia_bars  = asia_late + asia_early
    ah = max((b['high'] for b in asia_bars), default=current_price)
    al = min((b['low']  for b in asia_bars), default=current_price)

    lh, ll, lo = _range(h1_bars, 7, 13)
    nh, nl, no = _range(h1_bars, 13, 20)

    pvts = _pivots(pdh, pdl, pdc)
    vwap, vslope, vstd = _vwap(today_bars) if today_bars else (current_price, 0.0, 1.0)

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
    )
