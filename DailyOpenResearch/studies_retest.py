"""
Study 8 - SWING HIGH/LOW RETEST.

Distinct from the fib study (studies_fib.py), which watches the FIRST shallow
pullback right after a leg forms. This watches a confirmed swing high or low
get fully re-approached LATER in the day - after price has already moved on
to do something else - and asks what happens when it comes back: does the
level act as support/resistance (reject) or get taken out (break)?  This is
the "retest of a prior high/low, then a tradeable position opens" pattern.

Method, per day:
  1. Walk the day with the same ATR-threshold zigzag as the fib study
     (theta = theta_adr x trailing ADR). A pivot (swing high or low) is
     CONFIRMED at the bar where price has moved theta away from it in the
     other direction - that confirmation bar is also the first bar the
     search below is allowed to see (no lookahead: at the extreme bar
     itself you don't yet know it's a pivot).
  2. From the bar AFTER confirmation, walk forward for the FIRST bar whose
     [low,high] range touches back to the pivot price (a full retest, not
     the shallow 23.6% pullback the fib study looks for). Only the first
     retest per pivot is scored, matching the PDH/PDL/Asia-range convention
     already used in studies_session.py.
  3. At the retest bar, race forward (real bars only): REJECT = price
     moves REACT_ADR x ADR away from the level (back toward the pivot's
     origin side) before BREAK = price moves REACT_ADR x ADR through the
     level (past the old extreme) - same 0.15-ADR race convention as the
     PDH/PDL study, so the numbers compare directly.
  4. Two trade sims mirror the Asia-range breakout/sweep-fade pair:
     "reject" bets the level holds (stop at the break threshold, target
     the reject threshold); "break" bets it gives way (stop at the reject
     threshold, target one swing-size extension beyond the level).

No lookahead: the pivot's very existence, its confirmation bar, and every
downstream measurement are all causal.
"""
from __future__ import annotations
import numpy as np
from .data import Days, DOW_NAMES, vol_regime, INSTRUMENTS
from .stats import prop_ci, summarize, trade_stats, bucketize, is_oos

REACT_ADR = 0.15   # same race distance as prior_levels_study's PDH/PDL reaction


def _confirmed_pivots(h, l, theta):
    """Causal zigzag: returns (pivot_bar_idx, pivot_price, kind, confirm_bar_idx)
    for every swing high/low confirmed during the day. confirm_bar_idx is the
    bar at which theta-away movement proved the pivot - nothing before that
    bar may be used to detect or react to this pivot."""
    piv = []
    n = len(h)
    if n < 3:
        return piv
    dir_ = 0
    ext_i, ext_p_h, ext_p_l = 0, h[0], l[0]
    for k in range(1, n):
        if dir_ >= 0:
            if h[k] > ext_p_h:
                ext_p_h, ext_i = h[k], k
            if ext_p_h - l[k] >= theta:
                piv.append((ext_i, ext_p_h, "H", k))
                dir_ = -1
                ext_p_l, ext_i = l[k], k
                continue
        if dir_ <= 0:
            if l[k] < ext_p_l:
                ext_p_l, ext_i = l[k], k
            if h[k] - ext_p_l >= theta:
                piv.append((ext_i, ext_p_l, "L", k))
                dir_ = 1
                ext_p_h, ext_i = h[k], k
    return piv


def retest_study(days: Days, pair: str, theta_adr: float = 0.15) -> dict:
    cost = INSTRUMENTS[pair]["cost"]
    recs = []
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        adr = days.adr20[i]
        theta = theta_adr * adr
        react = REACT_ADR * adr
        pivots = _confirmed_pivots(h, l, theta)
        for order, (pi, pp, kind, ci) in enumerate(pivots):
            start = ci + 1
            if start >= len(h):
                continue
            is_high = kind == "H"
            touch = np.flatnonzero((l[start:] <= pp) & (h[start:] >= pp))
            if not touch.size:
                continue
            j = start + int(touch[0])
            rec = {"day": i, "is_high": is_high, "leg_adr": None, "retest_min": int(ms[j] - ms[ci]),
                   "order": order, "year": int(days.year[i]), "dow": DOW_NAMES[days.trade_dow[i]],
                   "regime": vol_regime(days, i)}
            # size of the swing this pivot ended (distance from the prior
            # opposite pivot, or from the day open for the first pivot)
            prior_px = pivots[order - 1][1] if order > 0 else o[0]
            rec["leg_adr"] = abs(pp - prior_px) / adr
            if j + 1 >= len(h):
                continue
            hh, ll, cc = h[j + 1:], l[j + 1:], c[j + 1:]
            if is_high:
                break_lvl, reject_lvl = pp + react, pp - react
                ti = np.flatnonzero(hh >= break_lvl); bi = np.flatnonzero(ll <= reject_lvl)
            else:
                break_lvl, reject_lvl = pp - react, pp + react
                ti = np.flatnonzero(ll <= break_lvl); bi = np.flatnonzero(hh >= reject_lvl)
            ti = ti[0] if ti.size else np.inf; bi = bi[0] if bi.size else np.inf
            if ti == np.inf and bi == np.inf:
                rec["reaction"] = "neither"
            else:
                rec["reaction"] = "break" if ti < bi else "reject"
            sgn = 1 if is_high else -1
            rec["close_beyond"] = bool(sgn * (c[-1] - pp) > 0)
            entry = c[j]
            # reject sim: bet the level holds - stop at break_lvl, target reject_lvl
            risk_r = abs(break_lvl - entry)
            if risk_r > 0:
                if is_high:
                    tir = np.flatnonzero(ll[:] <= reject_lvl); sir = np.flatnonzero(hh[:] >= break_lvl)
                else:
                    tir = np.flatnonzero(hh[:] >= reject_lvl); sir = np.flatnonzero(ll[:] <= break_lvl)
                tir = tir[0] if tir.size else np.inf; sir = sir[0] if sir.size else np.inf
                if tir == np.inf and sir == np.inf:
                    pnl = (cc[-1] - entry) * -sgn
                elif tir <= sir:
                    pnl = abs(reject_lvl - entry)
                else:
                    pnl = -risk_r
                rec["sim_reject"] = (pnl - cost) / risk_r
                rec["cost_reject"] = cost / risk_r
            # break sim: bet the level gives way - stop at reject_lvl, target one swing beyond break_lvl
            risk_b = abs(reject_lvl - entry)
            ext_target = pp + sgn * max(rec["leg_adr"] * adr, react)
            if risk_b > 0:
                if is_high:
                    tib = np.flatnonzero(hh[:] >= ext_target); sib = np.flatnonzero(ll[:] <= reject_lvl)
                else:
                    tib = np.flatnonzero(ll[:] <= ext_target); sib = np.flatnonzero(hh[:] >= reject_lvl)
                tib = tib[0] if tib.size else np.inf; sib = sib[0] if sib.size else np.inf
                if tib == np.inf and sib == np.inf:
                    pnl = (cc[-1] - entry) * sgn
                elif tib <= sib:
                    pnl = abs(ext_target - entry)
                else:
                    pnl = -risk_b
                rec["sim_break"] = (pnl - cost) / risk_b
                rec["cost_break"] = cost / risk_b
            recs.append(rec)

    n = len(recs)
    reacted = [r for r in recs if r["reaction"] in ("break", "reject")]

    def block(xs):
        nn = len(xs)
        rr = [r for r in xs if r["reaction"] in ("break", "reject")]
        return {
            "n": nn,
            "reject": prop_ci(sum(r["reaction"] == "reject" for r in rr), len(rr)),
            "break": prop_ci(sum(r["reaction"] == "break" for r in rr), len(rr)),
            "unresolved": prop_ci(sum(r["reaction"] == "neither" for r in xs), nn),
            "close_beyond_after_retest": prop_ci(sum(r["close_beyond"] for r in xs), nn),
            "retest_minutes": summarize([r["retest_min"] for r in xs], 0),
            "swing_size_adr": summarize([r["leg_adr"] for r in xs]),
            "sim_reject": trade_stats([r["sim_reject"] for r in xs if "sim_reject" in r], [r["cost_reject"] for r in xs if "sim_reject" in r]),
            "sim_break": trade_stats([r["sim_break"] for r in xs if "sim_break" in r], [r["cost_break"] for r in xs if "sim_break" in r]),
        }

    out = {"theta_adr": theta_adr, "react_adr": REACT_ADR, "all": block(recs)}
    out["by_kind"] = {"swing_high_retest": block([r for r in recs if r["is_high"]]),
                       "swing_low_retest": block([r for r in recs if not r["is_high"]])}
    out["by_order"] = {"first_pivot_of_day": block([r for r in recs if r["order"] == 0]),
                        "later_pivot": block([r for r in recs if r["order"] > 0])}
    out["by_swing_size"] = {}
    for lab, lo, hi in (("<0.2 ADR", 0, 0.2), ("0.2-0.4", 0.2, 0.4), ("0.4-0.7", 0.4, 0.7), (">0.7 ADR", 0.7, 99)):
        xs = [r for r in recs if lo <= r["leg_adr"] < hi]
        if len(xs) >= 30:
            out["by_swing_size"][lab] = block(xs)
    out["by_retest_speed"] = {}
    for lab, lo, hi in (("<=30min", 0, 30), ("30-120min", 30, 120), (">120min", 120, 99999)):
        xs = [r for r in recs if lo <= r["retest_min"] < hi]
        if len(xs) >= 30:
            out["by_retest_speed"][lab] = block(xs)
    out["by_vol_regime"] = {g: block([r for r in recs if r["regime"] == g]) for g in ("quiet", "normal", "heavy") if sum(1 for r in recs if r["regime"] == g) >= 30}
    out["by_year"] = {r["year"]: None for r in recs}
    out["by_year"] = {y: block([r for r in recs if r["year"] == y]) for y in sorted({r["year"] for r in recs})}
    is_, oos = is_oos(recs, "day", days.n)
    out["is_oos"] = {"IS": block(is_), "OOS": block(oos)}
    out["retests_per_day"] = summarize([sum(1 for r in recs if r["day"] == i) for i in range(days.n) if days.valid(i) and not days.is_weekend_day(i)], 1)
    return out
