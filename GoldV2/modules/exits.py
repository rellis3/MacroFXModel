"""
Exit Engine V2 — structure-anchored SL, level-to-level TPs.

V1's failure (visible in the demo record): swing_origin of a big H4 leg is
nearly always further than the 40-pip cap, so the cap silently became the SL
— an arbitrary $40 stop with no structural meaning — while fixed 3R targets
sat outside what a session could deliver (half the paper trades EXPIRED).

V2 rules:

  SL — anchored to the CONFIRMATION SWING: the M5 swing low (long) / swing
       high (short) that formed the VuManChu signal at the zone, minus an
       ATR buffer. Fallback: the zone's far edge minus buffer. If the
       resulting stop exceeds `max_sl_pips`, the trade is SKIPPED — a setup
       that doesn't fit the risk box is not a setup (never truncate the stop
       into no-man's-land).

  TP — level-to-level: the bot already computes a map of obstacles (opposing
       zones, nPOCs, VWAP anchors, pivots, prev-day H/L, POC/VAH/VAL, the
       impulse end). TP1 = first meaningful obstacle at least `tp1_r_min` R
       away; TP2 = next major obstacle, clamped to [tp2_r_min, tp2_r_max] R.
       If no obstacle gives TP1 ≥ tp1_r_min R, the trade is skipped (no room).

  Range sanity cap — a target outside the day's remaining expected range
       statistically can't be reached today; TP2 is clamped to it. The
       expected range comes from the platform's σ forecast (/api/vol-forecast,
       midnight-anchored hl_median/oc_75 for GOLD) when available, falling
       back to a daily-ATR proxy. The oc_75 line additionally acts as a hard
       exhaustion cap — price rarely travels beyond it from the open, so a TP
       outside it is wishful. HTF-aligned trades that are allowed to run
       overnight get a relaxed cap.

Returns an ExitPlan or None (None == skip the trade, with `skip_reason` via
plan_exits(...) second return value).
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ExitPlan:
    sl: float
    tp1: float
    tp2: float
    sl_dist: float
    tp1_r: float
    tp2_r: float
    sl_basis: str          # 'confirm_swing' | 'zone_edge'
    tp1_basis: str         # description of the level TP1 sits at
    tp2_basis: str
    obstacles: list = field(default_factory=list)   # [(price, label), ...] profit-side


# ── Obstacle collection ───────────────────────────────────────────────────────

def collect_obstacles(direction: str, price: float,
                      zones: list, vol=None, session=None,
                      primary_swing_end: float = 0.0) -> list[tuple[float, str]]:
    """
    Prices in the profit direction that price is likely to react at.
    zones: scored ZoneV2 list (both directions) from the level matrix.
    """
    cands: list[tuple[float, str]] = []

    def _add(p, label):
        if not p:
            return
        if direction == 'LONG' and p > price:
            cands.append((float(p), label))
        elif direction == 'SHORT' and p < price:
            cands.append((float(p), label))

    # Opposing zones (a sell zone above is resistance for a long, etc.)
    opposing = 'short' if direction == 'LONG' else 'long'
    for z in zones:
        if z.direction == opposing and z.active:
            _add(z.centre, f'{opposing} zone {z.centre:.1f} (score {z.score:.1f})')

    if vol:
        _add(vol.poc, f'POC {vol.poc:.1f}')
        _add(vol.vah, f'VAH {vol.vah:.1f}')
        _add(vol.val, f'VAL {vol.val:.1f}')
        for n in vol.npoc_stack:
            _add(n.price, f'nPOC {n.price:.1f} ({n.age_days}d)')

    if session:
        _add(session.daily_open, 'Daily open')
        _add(session.prev_daily_high, 'Prev day high')
        _add(session.prev_daily_low, 'Prev day low')
        _add(session.vwap, 'VWAP')
        for p, lbl in ((session.pivot, 'Pivot'), (session.r1, 'R1'), (session.r2, 'R2'),
                       (session.s1, 'S1'), (session.s2, 'S2')):
            _add(p, lbl)
        for a in session.vwap_anchors:
            _add(a.price, f'VWAP anchor {a.price:.1f} ({a.age_days}d)')

    # The impulse end of the zone's primary leg — the natural full-retrace target
    _add(primary_swing_end, f'Impulse end {primary_swing_end:.1f}')

    # Sort nearest-first in the profit direction
    cands.sort(key=lambda t: t[0], reverse=(direction == 'SHORT'))

    # Merge obstacles within $1.5 of each other (same shelf)
    merged: list[tuple[float, str]] = []
    for p, lbl in cands:
        if merged and abs(p - merged[-1][0]) <= 1.5:
            continue
        merged.append((p, lbl))
    return merged


# ── Remaining expected range (σ forecast, ATR fallback) ──────────────────────

def remaining_range(direction: str, price: float, daily_atr: float,
                    today_high: float, today_low: float,
                    mult: float = 1.2,
                    vol_fc: Optional[dict] = None) -> float:
    """
    How much further the day can statistically travel in the profit direction.

    vol_fc (from /api/vol-forecast, midnight-anchored): when present, the
    expected full-day range is session_open × hl_median% — the platform's own
    σ-based range distribution — instead of the daily-ATR proxy. What's left
    on the profit side is the expected range minus the ground already covered
    from the opposite extreme. Never below 20% of the range basis (freak days
    do extend).
    """
    if vol_fc and vol_fc.get('expected_range'):
        expected = float(vol_fc['expected_range']) * mult
        floor    = expected / mult * 0.2
    else:
        expected = daily_atr * mult
        floor    = daily_atr * 0.2
    if direction == 'LONG':
        room = (today_low + expected) - price
    else:
        room = price - (today_high - expected)
    return max(room, floor)


# ── Main entry point ──────────────────────────────────────────────────────────

def plan_exits(zone, direction: str, price: float,
               confirm_swing: Optional[float], atr_15m: float,
               daily_atr: float, today_high: float, today_low: float,
               zones: list, vol=None, session=None,
               cfg: Optional[dict] = None,
               vol_fc: Optional[dict] = None) -> tuple[Optional[ExitPlan], str]:
    """
    Returns (ExitPlan, '') on success or (None, skip_reason) when the setup
    does not fit the risk/reward box.

    vol_fc: optional σ-forecast dict from /api/vol-forecast —
      {expected_range, upper_oc_75, lower_oc_75} in price units. Used for the
      remaining-range cap and as a hard TP exhaustion line.
    """
    cfg = cfg or {}
    max_sl      = float(cfg.get('max_sl_pips', 40))
    min_sl      = float(cfg.get('min_sl_pips', 4))
    buf         = atr_15m * float(cfg.get('sl_buffer_atr', 0.3))
    tp1_r_min   = float(cfg.get('tp1_r_min', 1.0))
    tp2_r_min   = float(cfg.get('tp2_r_min', 1.5))
    tp2_r_max   = float(cfg.get('tp2_r_max', 4.0))
    range_mult  = float(cfg.get('range_cap_mult', 1.2))
    overnight   = bool(cfg.get('allow_overnight_htf_aligned', True)) and \
                  bool(getattr(zone, 'htf_aligned', False))

    sign = 1 if direction == 'LONG' else -1

    # ── SL ────────────────────────────────────────────────────────────────────
    sl_basis = 'confirm_swing'
    if direction == 'LONG':
        anchor = confirm_swing if (confirm_swing and confirm_swing < price) else None
        if anchor is None:
            anchor, sl_basis = zone.gp_low, 'zone_edge'
        sl = anchor - buf
    else:
        anchor = confirm_swing if (confirm_swing and confirm_swing > price) else None
        if anchor is None:
            anchor, sl_basis = zone.gp_high, 'zone_edge'
        sl = anchor + buf

    sl_dist = abs(price - sl)

    if sl_dist < min_sl:
        # Confirmation swing sits on top of price — fall back to zone edge
        sl_basis = 'zone_edge'
        sl = (zone.gp_low - buf) if direction == 'LONG' else (zone.gp_high + buf)
        sl_dist = abs(price - sl)

    if sl_dist < min_sl:
        return None, f'SL too tight ({sl_dist:.1f}p < {min_sl}p) even from zone edge'
    if sl_dist > max_sl:
        return None, (f'structural SL {sl_dist:.1f}p exceeds cap {max_sl:.0f}p — '
                      f'setup does not fit the risk box (never truncate)')

    # ── TP candidates ─────────────────────────────────────────────────────────
    obstacles = collect_obstacles(direction, price, zones, vol, session,
                                  primary_swing_end=getattr(zone, 'swing_end', 0.0))

    room = remaining_range(direction, price, daily_atr, today_high, today_low,
                           range_mult, vol_fc=vol_fc)
    if overnight:
        room *= 1.5
    max_tp_price = price + sign * room

    # σ-forecast exhaustion line: price rarely travels beyond the oc_75 level
    # from the session open — cap intraday targets there (overnight trades
    # are exempt: the cap is a same-session statistic).
    if vol_fc and not overnight:
        oc75 = vol_fc.get('upper_oc_75') if direction == 'LONG' else vol_fc.get('lower_oc_75')
        if oc75 and sign * (max_tp_price - oc75) > 0 and sign * (oc75 - price) > 0:
            max_tp_price = float(oc75)

    def _r(p: float) -> float:
        return sign * (p - price) / sl_dist

    # TP1: first obstacle at ≥ tp1_r_min R (and inside the range cap)
    tp1 = tp1_basis = None
    for p, lbl in obstacles:
        r = _r(p)
        if r >= tp1_r_min and sign * (p - max_tp_price) <= 0:
            tp1, tp1_basis = p, lbl
            break
    if tp1 is None:
        # No mapped obstacle in reach — fall back to a plain 1R target if the
        # range allows it, otherwise skip (no room to get paid).
        fallback = price + sign * sl_dist * tp1_r_min
        if sign * (fallback - max_tp_price) <= 0:
            tp1, tp1_basis = fallback, f'{tp1_r_min:.1f}R (no mapped level)'
        else:
            return None, (f'no obstacle ≥ {tp1_r_min}R within remaining range '
                          f'({room:.0f}p) — no room to get paid')

    # TP2: next major obstacle beyond TP1, clamped to [tp2_r_min, tp2_r_max] R
    # and to the range cap.
    tp2 = tp2_basis = None
    for p, lbl in obstacles:
        r = _r(p)
        if sign * (p - tp1) > 0.5 and r >= tp2_r_min:
            tp2, tp2_basis = p, lbl
            break
    if tp2 is None:
        tp2, tp2_basis = price + sign * sl_dist * tp2_r_min, f'{tp2_r_min:.1f}R fallback'

    # Clamp TP2 into the R window and the range cap
    lo_r, hi_r = tp2_r_min, tp2_r_max
    tp2_r = _r(tp2)
    if tp2_r > hi_r:
        tp2, tp2_basis = price + sign * sl_dist * hi_r, f'{hi_r:.1f}R cap'
    elif tp2_r < lo_r:
        tp2, tp2_basis = price + sign * sl_dist * lo_r, f'{lo_r:.1f}R floor'
    if sign * (tp2 - max_tp_price) > 0:
        tp2, tp2_basis = max_tp_price, f'range cap ({room:.0f}p remaining)'
        if _r(tp2) < tp1_r_min:
            return None, 'range cap pulls TP2 below 1R — no room today'

    # Ensure ordering sanity
    if sign * (tp2 - tp1) < 0:
        tp2, tp2_basis = tp1, tp1_basis

    return ExitPlan(
        sl=round(sl, 2), tp1=round(tp1, 2), tp2=round(tp2, 2),
        sl_dist=round(sl_dist, 2),
        tp1_r=round(_r(tp1), 2), tp2_r=round(_r(tp2), 2),
        sl_basis=sl_basis, tp1_basis=tp1_basis, tp2_basis=tp2_basis,
        obstacles=obstacles[:8],
    ), ''
