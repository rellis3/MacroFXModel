"""
Confluence Scorer — assigns a weighted score to each Fibonacci zone.

Each zone's golden-pocket centre is compared against every other level type.
Overlapping levels within PROXIMITY_PIPS add to the zone's score.

Weights are intentionally asymmetric: nPOC and HTF alignment carry the most
weight because they represent the clearest institutional price memory.
"""

from __future__ import annotations
from .fib_engine import FibZone
from .volume_profile import VolumeProfile
from .session_engine import SessionLevels
from .htf_bias import HTFBias

PROXIMITY_PIPS = 3.0   # XAU/USD pip = $1, so 3.0 = $3 tolerance

WEIGHTS = {
    'fib_cluster':  1.5,   # another TF's fib aligns
    'npoc':         2.0,   # naked POC — highest institutional weight
    'poc':          1.5,
    'hvn':          1.2,
    'vah_val':      1.0,
    'daily_open':   1.5,
    'prev_day_hl':  1.2,
    'session_hl':   1.0,
    'pivot':        0.8,
    'vwap':         1.0,
    'htf_aligned':  1.5,
}


def _near(a: float, b: float, tol: float = PROXIMITY_PIPS) -> bool:
    return b != 0.0 and abs(a - b) <= tol


def _centre(z: FibZone) -> float:
    return (z.gp_low + z.gp_high) / 2


def score_zones(zones: list[FibZone], vol: VolumeProfile,
                session: SessionLevels, htf: HTFBias) -> list[FibZone]:
    """Score all zones in-place and return sorted highest-first."""
    for zone in zones:
        c     = _centre(zone)
        score = 0.0
        comp: list[str] = [f'{zone.tf} {zone.direction} GP']

        # Fib cluster: other TF zones nearby
        for other in zones:
            if other.zone_id == zone.zone_id:
                continue
            if _near(c, _centre(other), PROXIMITY_PIPS * 2):
                score += WEIGHTS['fib_cluster']
                comp.append(f'{other.tf} fib cluster')

        # Volume profile
        if vol.npoc and _near(c, vol.npoc):
            score += WEIGHTS['npoc'];  comp.append(f'nPOC {vol.npoc:.1f}')
        if _near(c, vol.poc):
            score += WEIGHTS['poc'];   comp.append(f'POC {vol.poc:.1f}')
        for hvn in vol.hvn_levels:
            if _near(c, hvn):
                score += WEIGHTS['hvn']; comp.append(f'HVN {hvn:.1f}'); break
        if _near(c, vol.vah):
            score += WEIGHTS['vah_val']; comp.append('VAH')
        elif _near(c, vol.val):
            score += WEIGHTS['vah_val']; comp.append('VAL')

        # Session / daily levels
        if session.daily_open and _near(c, session.daily_open):
            score += WEIGHTS['daily_open']; comp.append('Daily open')
        if _near(c, session.prev_daily_high) or _near(c, session.prev_daily_low):
            score += WEIGHTS['prev_day_hl']; comp.append('Prev day H/L')
        for lvl in (session.asia_high, session.asia_low,
                    session.london_high, session.london_low,
                    session.ny_high, session.ny_low):
            if lvl and _near(c, lvl):
                score += WEIGHTS['session_hl']; comp.append('Session H/L'); break
        for pvt in (session.pivot, session.r1, session.r2,
                    session.s1, session.s2):
            if _near(c, pvt, PROXIMITY_PIPS * 1.5):
                score += WEIGHTS['pivot']; comp.append('Pivot'); break
        if session.vwap and _near(c, session.vwap, PROXIMITY_PIPS * 2):
            score += WEIGHTS['vwap']; comp.append('VWAP')

        # HTF alignment
        bullish_zone = zone.direction == 'long'
        if (htf.bias == 'BULL' and bullish_zone) or (htf.bias == 'BEAR' and not bullish_zone):
            score += WEIGHTS['htf_aligned']
            zone.htf_aligned = True
            comp.append(f'HTF {htf.bias}')
        else:
            zone.htf_aligned = False

        zone.score       = round(score, 2)
        zone.composition = comp

    zones.sort(key=lambda z: z.score, reverse=True)
    return zones
