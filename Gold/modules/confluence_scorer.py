"""
Confluence Scorer — assigns a weighted score to each Fibonacci zone.

Each zone's golden-pocket centre is tested against every level type.
Overlapping levels within PROXIMITY_PIPS add to the zone's score.

nPOC stack weighting:
  Older untouched POCs score higher — a 10-day naked POC is a stronger
  institutional reference than yesterday's. Base weight 2.0 + 0.1 per day,
  capped at 3.0.

VWAP anchor weighting:
  Historical session-open right-angle price levels. Older = stronger.
  Base weight 1.8 + 0.05 per day, capped at 2.5.

Trendline weighting:
  Only directionally aligned trendlines score (ascending at long zone,
  descending at short zone). 2-touch = 1.2, 3+ touch = 1.8.
"""

from __future__ import annotations
from typing import Optional
from .fib_engine import FibZone
from .volume_profile import VolumeProfile
from .session_engine import SessionLevels
from .htf_bias import HTFBias
from .trendline_engine import Trendline

PROXIMITY_PIPS = 3.0   # $3 tolerance for XAU/USD

WEIGHTS = {
    'fib_cluster':    1.5,
    'fib_786':        1.2,   # GP centre aligns with .786 of a different impulse
    'fib_886':        1.5,   # GP centre aligns with .886 of a different impulse (rarer/tighter)
    'fib_382':        0.8,   # GP centre aligns with .382 of a different impulse
    'fib_50pct':      0.6,   # GP centre aligns with .5 of a different impulse
    'npoc_base':      2.0,   # + 0.1 per day old, cap 3.0
    'poc':            1.5,
    'hvn':            1.2,
    'vah_val':        1.0,
    'vwap_anchor':    1.8,   # + 0.05 per day old, cap 2.5
    'daily_open':     1.5,
    'prev_day_hl':    1.2,
    'session_hl':     1.0,
    'pivot':          0.8,
    'htf_aligned':    1.5,
    'trendline_2t':   1.2,   # 2-pivot trendline touch (aligned direction only)
    'trendline_3t':   1.8,   # 3+ pivot trendline touch
}


def _near(a: float, b: float, tol: float = PROXIMITY_PIPS) -> bool:
    return b != 0.0 and abs(a - b) <= tol


def _centre(z: FibZone) -> float:
    return (z.gp_low + z.gp_high) / 2


def score_zones(zones: list[FibZone], vol: VolumeProfile,
                session: SessionLevels, htf: HTFBias,
                trendlines: Optional[list[Trendline]] = None) -> list[FibZone]:
    """Score all zones in-place and return sorted highest-first."""
    for zone in zones:
        c     = _centre(zone)
        score = 0.0
        comp: list[str] = [f'{zone.tf} {zone.direction} GP']

        # ── Fib cluster (entry-level alignment across different impulses) ───────
        for other in zones:
            if other.zone_id == zone.zone_id:
                continue
            if other.swing_origin == zone.swing_origin and other.swing_end == zone.swing_end:
                continue   # same impulse, different variant — not a cluster
            if _near(c, _centre(other), PROXIMITY_PIPS * 2):
                score += WEIGHTS['fib_cluster']
                comp.append(f'{other.tf} {other.zone_variant} cluster')

        # ── Cross-impulse deep retrace levels (.382, .786, .886) ──────────────
        # Scores when this zone's entry centre aligns with a significant level
        # of a DIFFERENT impulse leg (e.g. .786 of H4 impulse = .618 of D1).
        # Sibling zones from the same impulse (GP/.786/.886 variants) share
        # identical levels and are explicitly excluded to prevent self-scoring.
        for other in zones:
            if other.zone_id == zone.zone_id:
                continue
            if other.swing_origin == zone.swing_origin and other.swing_end == zone.swing_end:
                continue   # same impulse leg — different variant, not cross-impulse
            tol = PROXIMITY_PIPS * 1.5
            if _near(c, other.level_886, tol):
                score += WEIGHTS['fib_886']
                comp.append(f'{other.tf} .886 @ {other.level_886:.1f}')
            elif _near(c, other.level_786, tol):
                score += WEIGHTS['fib_786']
                comp.append(f'{other.tf} .786 @ {other.level_786:.1f}')
            elif _near(c, other.level_382, tol):
                score += WEIGHTS['fib_382']
                comp.append(f'{other.tf} .382 @ {other.level_382:.1f}')
            elif _near(c, other.level_500, tol):
                score += WEIGHTS['fib_50pct']
                comp.append(f'{other.tf} .5 @ {other.level_500:.1f}')

        # ── nPOC stack — oldest (strongest) first ─────────────────────────────
        for npoc in vol.npoc_stack:
            if _near(c, npoc.price):
                w = min(WEIGHTS['npoc_base'] + npoc.age_days * 0.1, 3.0)
                score += w
                comp.append(f'nPOC {npoc.price:.1f} ({npoc.age_days}d)')
                break   # one nPOC credit per zone even if multiple cluster

        # ── Today's POC / VAH / VAL / HVN ────────────────────────────────────
        if _near(c, vol.poc):
            score += WEIGHTS['poc']; comp.append(f'POC {vol.poc:.1f}')
        for hvn in vol.hvn_levels:
            if _near(c, hvn):
                score += WEIGHTS['hvn']; comp.append(f'HVN {hvn:.1f}'); break
        if _near(c, vol.vah):
            score += WEIGHTS['vah_val']; comp.append('VAH')
        elif _near(c, vol.val):
            score += WEIGHTS['vah_val']; comp.append('VAL')

        # ── VWAP anchor levels — session open right-angle prices ──────────────
        for anchor in session.vwap_anchors:
            if _near(c, anchor.price, PROXIMITY_PIPS * 1.5):
                w = min(WEIGHTS['vwap_anchor'] + anchor.age_days * 0.05, 2.5)
                score += w
                comp.append(
                    f'VWAP anchor {anchor.price:.1f} '
                    f'({anchor.session} {anchor.age_days}d {anchor.direction})'
                )
                break

        # ── Trendline confluence (direction-aligned only) ─────────────────────
        if trendlines:
            for tl in trendlines:
                if not _near(c, tl.projected, PROXIMITY_PIPS * 2):
                    continue
                aligned = (
                    (tl.kind == 'ascending'  and zone.direction == 'long') or
                    (tl.kind == 'descending' and zone.direction == 'short')
                )
                if aligned:
                    w = WEIGHTS['trendline_3t'] if tl.touches >= 3 else WEIGHTS['trendline_2t']
                    score += w
                    comp.append(
                        f'{tl.tf} {tl.kind} TL ({tl.touches}t @ {tl.projected:.1f})'
                    )
                    break   # one trendline credit per zone

        # ── Session / daily levels ────────────────────────────────────────────
        tol_pd = PROXIMITY_PIPS * 1.5
        if session.daily_open and _near(c, session.daily_open, tol_pd):
            score += WEIGHTS['daily_open']; comp.append('Daily open')
        if _near(c, session.prev_daily_high, tol_pd) or _near(c, session.prev_daily_low, tol_pd):
            score += WEIGHTS['prev_day_hl']; comp.append('Prev day H/L')
        for lvl in (session.asia_high, session.asia_low,
                    session.london_high, session.london_low,
                    session.ny_high, session.ny_low):
            if lvl and _near(c, lvl, tol_pd):
                score += WEIGHTS['session_hl']; comp.append('Session H/L'); break
        for pvt in (session.pivot, session.r1, session.r2, session.s1, session.s2):
            if _near(c, pvt, PROXIMITY_PIPS * 1.5):
                score += WEIGHTS['pivot']; comp.append('Pivot'); break

        # ── HTF alignment ─────────────────────────────────────────────────────
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
