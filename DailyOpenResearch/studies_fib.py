"""
Study 4 - IMPULSE LEG, THEN FIB RETRACE.

The retail setup in the screenshot: an impulsive move from a low to a high
shortly after the daily open, fib drawn low->high, wait for the pullback to
a fib level, enter for a continuation to the high and the 1.1 / 1.2 / 1.272 /
1.618 extensions.

Definitions (all relative to trailing ADR so instruments are comparable):
  leg      : a swing from a confirmed pivot low to the running high (or the
             mirror), detected by a zig-zag with threshold THETA x ADR.
  drawn    : the moment the leg is "drawable" - price has given back at
             least 23.6% of it.  Everything after is out-of-sample for the
             drawer of the fib.
  depth    : fraction of the leg given back at the deepest point of the
             pullback BEFORE the leg's extreme is exceeded (continuation)
             or the leg origin is taken out (failure).  NB TradingView's
             fib drawn low->high shows level = 1 - depth (0.618 on the
             chart = 0.382 depth).
  extension: after continuation, the furthest level reached in leg units
             (1.0 = the old extreme, 1.272, 1.618 ...) before the day ends
             or price falls back through 0.5 depth of the ORIGINAL leg.
  impulsive: leg efficiency (net move / sum of |1m closes changes|) in the
             top half of legs, AND speed (leg size per minute) in the top
             half.  Grind legs are the control group.
"""
from __future__ import annotations
import numpy as np
from .data import Days, DOW_NAMES, vol_regime, INSTRUMENTS
from .stats import prop_ci, summarize, trade_stats, bucketize, is_oos

DEPTH_EDGES = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
DEPTH_LABELS = ["<0.236", "0.236-0.382", "0.382-0.5", "0.5-0.618", "0.618-0.786", "0.786-1.0", ">=1.0 (failed)"]
EXT_LEVELS = [1.1, 1.2, 1.272, 1.5, 1.618, 2.0]
ENTRY_DEPTHS = [0.382, 0.5, 0.618, 0.786]


def fib_events(h, l, theta, ms, max_open_min):
    """Causal event generator.  Walks the day bar by bar keeping the last
    CONFIRMED pivot (confirmed by a theta move away from it - i.e. by the leg
    itself) and the running extreme since that pivot.  An event opens the
    first time price gives back >= 23.6% of a leg of size >= theta - the
    moment the fib becomes drawable.  Nothing about the event's definition
    uses bars after its open, so outcomes are genuinely out of sample.
    After a continuation the extended leg can spawn a new event on its next
    23.6% pullback (the trader redraws the fib), which is how it is traded.
    Returns list of (i0, p0, i1, p1, up, open_idx)."""
    ev = []
    n = len(h)
    dir_ = 0; ext_h = h[0]; ext_l = l[0]; ih = 0; il = 0
    piv_i = 0; piv_p = None
    armed = True   # can a new event open on the current leg?
    for k in range(1, n):
        if dir_ == 0:
            if h[k] > ext_h: ext_h = h[k]; ih = k
            if l[k] < ext_l: ext_l = l[k]; il = k
            if h[k] - ext_l >= theta:
                dir_ = 1; piv_i, piv_p = il, ext_l; ext_h, ih = h[k], k; armed = True
            elif ext_h - l[k] >= theta:
                dir_ = -1; piv_i, piv_p = ih, ext_h; ext_l, il = l[k], k; armed = True
            continue
        if dir_ == 1:
            if h[k] > ext_h:
                ext_h, ih = h[k], k; armed = True
            leg = ext_h - piv_p
            if armed and leg >= theta and (ext_h - l[k]) >= 0.236 * leg and ms[k] <= max_open_min and ih < k:
                ev.append((piv_i, piv_p, ih, ext_h, True, k)); armed = False
            if ext_h - l[k] >= theta:      # pivot high confirmed, flip
                dir_ = -1; piv_i, piv_p = ih, ext_h; ext_l, il = l[k], k; armed = True
        else:
            if l[k] < ext_l:
                ext_l, il = l[k], k; armed = True
            leg = piv_p - ext_l
            if armed and leg >= theta and (h[k] - ext_l) >= 0.236 * leg and ms[k] <= max_open_min and il < k:
                ev.append((piv_i, piv_p, il, ext_l, False, k)); armed = False
            if h[k] - ext_l >= theta:
                dir_ = 1; piv_i, piv_p = il, ext_l; ext_h, ih = h[k], k; armed = True
    return ev


def fib_study(days: Days, pair: str, theta_adr=0.12, max_leg_end_min=240, max_follow_min=600) -> dict:
    cost = INSTRUMENTS[pair]["cost"]
    legs = []
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        adr = days.adr20[i]; theta = theta_adr * adr
        lim = int(np.searchsorted(ms, max_leg_end_min + 1))
        events = fib_events(h[:lim], l[:lim], theta, ms[:lim], max_leg_end_min)
        for a, (i0, p0, i1, p1, up, k_open) in enumerate(events):
            leg = abs(p1 - p0); sgn = 1 if up else -1
            dur = max(1, ms[i1] - ms[i0])
            path = np.abs(np.diff(c[i0:i1 + 1])).sum()
            eff = leg / path if path > 0 else 0.0
            speed = (leg / adr) / dur * 60  # ADR per hour
            # forward walk from the OPEN bar of the event (inclusive of its close)
            depth_series = ((p1 - l[k_open:]) if up else (h[k_open:] - p1)) / leg
            beyond = ((h[k_open:] > p1) if up else (l[k_open:] < p1))
            end_rel = int(min(len(depth_series), np.searchsorted(ms[k_open:], ms[k_open] + max_follow_min)))
            dep = depth_series[:end_rel]; bey = beyond[:end_rel]
            cont_idx = np.flatnonzero(bey); fail_idx = np.flatnonzero(dep >= 1.0)
            ci = cont_idx[0] if cont_idx.size else np.inf; fi = fail_idx[0] if fail_idx.size else np.inf
            if ci == np.inf and fi == np.inf:
                outcome = "neither"; end = end_rel; max_depth = float(dep.max()) if dep.size else 0.236
            elif ci < fi:
                outcome = "continuation"; end = int(ci); max_depth = float(dep[:int(ci) + 1].max())
            else:
                outcome = "failed"; end = int(fi); max_depth = 1.0
            ext = None
            if outcome == "continuation":
                j = k_open + end
                back = np.flatnonzero(depth_series[end:] >= 0.5)
                stop_j = k_open + (end + int(back[0]) if back.size else len(depth_series))
                seg_h = h[j:stop_j]; seg_l = l[j:stop_j]
                if seg_h.size:
                    ext = ((seg_h.max() - p0) / leg) if up else ((p0 - seg_l.min()) / leg)
            # close-depth at the first bar reaching each depth (for the empirical random-walk null)
            reach_close = {}
            cdep = ((p1 - c[k_open:]) if up else (c[k_open:] - p1)) / leg
            for d in (0.236, 0.382, 0.5, 0.618, 0.786):
                hit = np.flatnonzero(dep >= d)
                if hit.size and hit[0] <= end:
                    reach_close[d] = float(min(max(cdep[int(hit[0])], d), 1.0))
            sims = {}; costs = {}
            for ed in ENTRY_DEPTHS:
                hit = np.flatnonzero(dep >= ed)
                if not hit.size or hit[0] > end:
                    continue
                e = int(hit[0])
                entry_px = p1 - sgn * ed * leg
                hh = h[k_open + e + 1:]; ll = l[k_open + e + 1:]; cc = c[k_open + e + 1:]
                for sname, sdepth in (("tight", ed + 0.236), ("origin", 1.0), ("origin+10%", 1.1)):
                    stop_px = p1 - sgn * sdepth * leg
                    risk = (sdepth - ed) * leg
                    for tname, tlev in (("extreme", 0.0), ("1.272", -0.272), ("1.618", -0.618)):
                        tgt_px = p1 - sgn * tlev * leg
                        if up:
                            ti = np.flatnonzero(hh >= tgt_px); si = np.flatnonzero(ll <= stop_px)
                        else:
                            ti = np.flatnonzero(ll <= tgt_px); si = np.flatnonzero(hh >= stop_px)
                        ti = ti[0] if ti.size else np.inf; si = si[0] if si.size else np.inf
                        if ti == np.inf and si == np.inf:
                            pnl = (cc[-1] - entry_px) * sgn if cc.size else 0.0
                        elif ti <= si:
                            pnl = (tgt_px - entry_px) * sgn
                        else:
                            pnl = -risk
                        key = f"entry_{ed}|stop_{sname}|target_{tname}"
                        sims[key] = (pnl - cost) / risk; costs[key] = cost / risk
            legs.append({"day": i, "up": up, "leg_adr": leg / adr, "dur": int(dur), "eff": eff, "speed": speed,
                         "end_min": int(ms[i1]), "open_min": int(ms[k_open]), "outcome": outcome, "max_depth": max_depth, "ext": ext,
                         "sims": sims, "costs": costs, "reach_close": reach_close, "year": int(days.year[i]), "dow": DOW_NAMES[days.trade_dow[i]],
                         "regime": vol_regime(days, i), "first_leg": a == 0, "news": getattr(days, "news", [None] * days.n)[i]})
    if not legs:
        return {"n_legs": 0}
    eff_med = float(np.median([x["eff"] for x in legs])); spd_med = float(np.median([x["speed"] for x in legs]))
    for x in legs:
        x["impulsive"] = x["eff"] >= eff_med and x["speed"] >= spd_med

    def block(xs):
        n = len(xs)
        cont = [x for x in xs if x["outcome"] == "continuation"]
        r = {"n_legs": n, "outcome": {k: prop_ci(sum(x["outcome"] == k for x in xs), n) for k in ("continuation", "failed", "neither")},
             "leg_size_adr": summarize([x["leg_adr"] for x in xs]), "leg_minutes": summarize([x["dur"] for x in xs], 0),
             "deepest_pullback_before_resolution": {}}
        # depth distribution among resolved legs (continuation only: what level held?)
        for lab in DEPTH_LABELS:
            k = sum(1 for x in cont if bucketize(x["max_depth"], DEPTH_EDGES, DEPTH_LABELS) == lab)
            r["deepest_pullback_before_resolution"][lab] = prop_ci(k, len(cont))
        # conditional: given price reached depth d (and had not failed), P(continuation)
        r["P_continuation_given_pullback_reached"] = {}
        for d in [0.236, 0.382, 0.5, 0.618, 0.786]:
            reached = [x for x in xs if x["max_depth"] >= d]
            ci = prop_ci(sum(x["outcome"] == "continuation" for x in reached), len(reached))
            # driftless random-walk null: from depth d the extreme is d*leg away and the origin (1-d)*leg away,
            # so P(extreme first) = 1 - d.  Anything at or below this is NOT a continuation edge.
            ci["random_walk_null_pct"] = round(100 * (1 - d), 1)
            # empirical null: 1 - (close depth at the bar that first reached d), averaged - the
            # discrete bars overshoot the level so the fair probability is a little below 1 - d
            rc = [x["reach_close"][d] for x in reached if d in x["reach_close"]]
            ci["random_walk_null_at_bar_close_pct"] = round(100 * float(np.mean([1 - v for v in rc])), 1) if rc else None
            r["P_continuation_given_pullback_reached"][str(d)] = ci
        r["extension_after_continuation"] = {str(e): prop_ci(sum(1 for x in cont if x["ext"] is not None and x["ext"] >= e), len(cont)) for e in EXT_LEVELS}
        r["extension_reached_summary"] = summarize([x["ext"] for x in cont if x["ext"] is not None])
        r["sims"] = {}
        keys = sorted({k for x in xs for k in x["sims"]})
        for k in keys:
            r["sims"][k] = trade_stats([x["sims"][k] for x in xs if k in x["sims"]], [x["costs"][k] for x in xs if k in x["sims"]])
        return r

    is_, oos = is_oos(legs, "day", days.n)
    out = {"theta_adr": theta_adr, "max_leg_end_min": max_leg_end_min, "all_legs": block(legs),
           "is_oos": {"IS": {"n": len(is_), "P_cont_given_reached": block(is_)["P_continuation_given_pullback_reached"], "sims": block(is_)["sims"]},
                      "OOS": {"n": len(oos), "P_cont_given_reached": block(oos)["P_continuation_given_pullback_reached"], "sims": block(oos)["sims"]}},
           "impulsive_legs": block([x for x in legs if x["impulsive"]]),
           "grind_legs": block([x for x in legs if not x["impulsive"]]),
           "first_leg_of_day_only": block([x for x in legs if x["first_leg"]]),
           "by_leg_size": {}, "by_year": {}, "by_regime": {}, "by_direction": {}}
    for lab, lo, hi in (("0.12-0.2 ADR", 0.12, 0.2), ("0.2-0.35", 0.2, 0.35), (">0.35 ADR", 0.35, 99)):
        xs = [x for x in legs if lo <= x["leg_adr"] < hi]
        if len(xs) >= 30:
            b = block(xs); out["by_leg_size"][lab] = {"n": b["n_legs"], "outcome": b["outcome"], "sims": b["sims"]}
    for y in sorted({x["year"] for x in legs}):
        xs = [x for x in legs if x["year"] == y]
        b = block(xs); out["by_year"][y] = {"n": b["n_legs"], "continuation": b["outcome"]["continuation"], "sims": b["sims"]}
    for g in ("quiet", "normal", "heavy"):
        xs = [x for x in legs if x["regime"] == g]
        if len(xs) >= 30:
            b = block(xs); out["by_regime"][g] = {"n": b["n_legs"], "continuation": b["outcome"]["continuation"], "sims": b["sims"]}
    out["by_news_day"] = {}
    for g, lab in ((True, "major news day"), (False, "no major news")):
        xs = [x for x in legs if x["news"] is g]
        if len(xs) >= 30:
            b = block(xs); out["by_news_day"][lab] = {"n": b["n_legs"], "P_cont_given_reached": b["P_continuation_given_pullback_reached"], "sims": b["sims"]}
    for g, lab in ((True, "up_legs"), (False, "down_legs")):
        xs = [x for x in legs if x["up"] == g]
        b = block(xs); out["by_direction"][lab] = {"n": b["n_legs"], "continuation": b["outcome"]["continuation"], "sims": b["sims"]}
    return out
