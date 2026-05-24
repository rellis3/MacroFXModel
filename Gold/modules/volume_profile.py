"""
Volume Profile Engine — POC, VAH, VAL, HVN, LVN, nPOC from MT5 M1 bars.

Bucket size: 0.5 price units (50 cents) for XAU/USD.
Value area: 70% of session volume.

nPOC (Naked POC): previous session's POC that has not yet been revisited
today. Remains an active magnet until price trades through it.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional

BUCKET_SIZE    = 0.5    # price per bucket
VALUE_AREA_PCT = 0.70


@dataclass
class VolumeProfile:
    poc: float
    vah: float
    val: float
    hvn_levels: list[float]
    lvn_levels: list[float]
    prev_poc: Optional[float]
    prev_vah: Optional[float]
    prev_val: Optional[float]
    npoc: Optional[float]
    session_high: float
    session_low: float
    total_volume: float
    computed_from_bars: int


def _build_histogram(bars: list[dict], bucket: float = BUCKET_SIZE) -> dict[float, float]:
    hist: dict[float, float] = {}
    for b in bars:
        lo_b = math.floor(b['low']  / bucket) * bucket
        hi_b = math.floor(b['high'] / bucket) * bucket
        n_buckets = max(1, round((hi_b - lo_b) / bucket) + 1)
        vol_each  = b.get('tick_volume', 1) / n_buckets
        cur = lo_b
        while cur <= hi_b + 1e-9:
            key = round(cur, 2)
            hist[key] = hist.get(key, 0.0) + vol_each
            cur = round(cur + bucket, 2)
    return hist


def _poc_vah_val(hist: dict[float, float]) -> tuple[float, float, float]:
    if not hist:
        return 0.0, 0.0, 0.0

    total  = sum(hist.values())
    poc    = max(hist, key=hist.__getitem__)
    target = total * VALUE_AREA_PCT
    keys   = sorted(hist.keys())
    poc_i  = keys.index(poc)
    lo_i = hi_i = poc_i
    accum = hist[poc]

    while accum < target and (lo_i > 0 or hi_i < len(keys) - 1):
        add_lo = hist.get(keys[lo_i - 1], 0.0) if lo_i > 0 else 0.0
        add_hi = hist.get(keys[hi_i + 1], 0.0) if hi_i < len(keys) - 1 else 0.0
        if add_lo >= add_hi and lo_i > 0:
            lo_i -= 1; accum += add_lo
        elif hi_i < len(keys) - 1:
            hi_i += 1; accum += add_hi
        else:
            lo_i -= 1; accum += add_lo

    return poc, keys[hi_i], keys[lo_i]


def _find_hvn_lvn(hist: dict[float, float],
                  min_hvn_pct: float = 0.05) -> tuple[list[float], list[float]]:
    if len(hist) < 5:
        return [], []
    keys  = sorted(hist.keys())
    vols  = [hist[k] for k in keys]
    total = sum(vols) or 1.0
    hvn, lvn = [], []
    for i in range(1, len(vols) - 1):
        rel = vols[i] / total
        if vols[i] > vols[i - 1] and vols[i] > vols[i + 1] and rel > min_hvn_pct:
            hvn.append(keys[i])
        elif vols[i] < vols[i - 1] and vols[i] < vols[i + 1] and rel < min_hvn_pct / 2:
            lvn.append(keys[i])
    return hvn, lvn


def compute_volume_profile(today_bars: list[dict], prev_bars: list[dict],
                           current_price: float) -> VolumeProfile:
    if not today_bars:
        return VolumeProfile(
            poc=current_price, vah=current_price + 5, val=current_price - 5,
            hvn_levels=[], lvn_levels=[],
            prev_poc=None, prev_vah=None, prev_val=None, npoc=None,
            session_high=current_price, session_low=current_price,
            total_volume=0.0, computed_from_bars=0,
        )

    today_hist = _build_histogram(today_bars)
    poc, vah, val = _poc_vah_val(today_hist)
    hvn, lvn      = _find_hvn_lvn(today_hist)

    session_high = max(b['high'] for b in today_bars)
    session_low  = min(b['low']  for b in today_bars)
    total_vol    = sum(b.get('tick_volume', 1) for b in today_bars)

    prev_poc = prev_vah = prev_val = npoc = None
    if prev_bars:
        ph = _build_histogram(prev_bars)
        prev_poc, prev_vah, prev_val = _poc_vah_val(ph)
        # nPOC: previous POC not yet traded through today
        if prev_poc and not (val <= prev_poc <= vah):
            npoc = prev_poc

    return VolumeProfile(
        poc=poc, vah=vah, val=val,
        hvn_levels=hvn, lvn_levels=lvn,
        prev_poc=prev_poc, prev_vah=prev_vah, prev_val=prev_val, npoc=npoc,
        session_high=session_high, session_low=session_low,
        total_volume=total_vol, computed_from_bars=len(today_bars),
    )
