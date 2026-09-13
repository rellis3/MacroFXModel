"""
Study 2 - OPENING RANGE BREAKOUT (ORB).

Retail version: mark the high/low of the first N minutes after the daily
open, trade the first close outside it in the breakout direction.

What we measure for N in {5, 15, 30, 60}:
  * how often a breakout happens at all, and how quickly
  * follow-through: does the DAY close on the breakout side?
  * the "race": does price reach +1 opening-range (OR) beyond the breakout
    level before it trades back through the opposite side of the OR?
  * false-breakout rate: after breaking one side, price later closes back
    through the OTHER side of the OR (both sides taken)
  * MFE / MAE to end of day, in OR units and in ADR units
  * conditioning: OR size relative to ADR (narrow vs wide), weekday, vol regime
  * a simple trade sim: entry at breakout close, stop at the opposite OR edge
    (or OR midpoint), target k x risk, exit at day end; net of cost, R units.
"""
from __future__ import annotations
import numpy as np
from .data import Days, DOW_NAMES, vol_regime, INSTRUMENTS
from .stats import prop_ci, summarize, trade_stats, binom_p, bucketize, is_oos


def _race(h, l, start, up_target, down_target):
    """From bar index `start`, which target is reached first? returns ('up'|'down'|None, bar_idx)."""
    hu = np.flatnonzero(h[start:] >= up_target)
    ld = np.flatnonzero(l[start:] <= down_target)
    iu = hu[0] if hu.size else np.inf
    idd = ld[0] if ld.size else np.inf
    if iu == np.inf and idd == np.inf:
        return None, None
    if iu <= idd:
        return "up", start + int(iu)
    return "down", start + int(idd)


def orb_study(days: Days, pair: str, windows=(5, 15, 30, 60), stop_mode="opposite", targets=(1.0, 2.0)) -> dict:
    cost = INSTRUMENTS[pair]["cost"]
    out = {}
    for w in windows:
        recs = []
        for i in range(days.n):
            if not days.valid(i) or days.is_weekend_day(i):
                continue
            o, h, l, c, v, ms = days.arrays(i)
            m = ms < w
            if m.sum() < max(2, w // 2) or (~m).sum() < 60:
                continue
            or_hi = h[m].max(); or_lo = l[m].min(); orr = or_hi - or_lo
            if orr <= 0:
                continue
            adr = days.adr20[i]
            after = np.flatnonzero(~m)
            a0 = after[0]
            # first CLOSE outside the OR
            up = np.flatnonzero(c[a0:] > or_hi); dn = np.flatnonzero(c[a0:] < or_lo)
            iu = up[0] if up.size else np.inf; idn = dn[0] if dn.size else np.inf
            if iu == np.inf and idn == np.inf:
                recs.append({"day": i, "broke": False, "or_adr": orr / adr})
                continue
            side = "up" if iu <= idn else "down"
            bi = a0 + int(min(iu, idn))
            entry = c[bi]
            sgn = 1 if side == "up" else -1
            # follow-through
            day_close = c[-1]
            close_side = np.sign(day_close - (or_hi if side == "up" else or_lo)) == sgn
            # race +1 OR vs opposite edge (from the bar after entry)
            if side == "up":
                res, _ = _race(h, l, bi + 1, or_hi + orr, or_lo)
            else:
                res, _ = _race(h, l, bi + 1, or_hi, or_lo - orr)
            race_win = None if res is None else (res == side)
            # random-walk null for this race: the breakout close sits closer to the +1 OR
            # target than to the opposite edge, so the fair probability is NOT 50%
            if side == "up":
                d_t = max(or_hi + orr - entry, 1e-12); d_o = max(entry - or_lo, 1e-12)
            else:
                d_t = max(entry - (or_lo - orr), 1e-12); d_o = max(or_hi - entry, 1e-12)
            race_null = d_o / (d_t + d_o)
            # both sides taken by close?
            other_taken = bool((c[bi + 1:] < or_lo).any()) if side == "up" else bool((c[bi + 1:] > or_hi).any())
            # MFE/MAE from entry to end of day
            mfe = (h[bi + 1:].max() - entry) * sgn if bi + 1 < len(h) else 0.0
            mae = (entry - l[bi + 1:].min()) * sgn if side == "up" else (h[bi + 1:].max() - entry)
            if side == "down":
                mfe = entry - l[bi + 1:].min() if bi + 1 < len(l) else 0.0
                mae = h[bi + 1:].max() - entry if bi + 1 < len(h) else 0.0
            # trade sims
            stop = (or_lo if side == "up" else or_hi) if stop_mode == "opposite" else (or_lo + or_hi) / 2
            risk = abs(entry - stop)
            sims = {}
            if risk > 0:
                for k in targets:
                    tgt = entry + sgn * k * risk
                    if side == "up":
                        res2, _ = _race(h, l, bi + 1, tgt, stop)
                    else:
                        res2, _ = _race(h, l, bi + 1, stop, tgt)
                    if res2 is None:
                        pnl = (day_close - entry) * sgn
                    elif res2 == side:
                        pnl = k * risk
                    else:
                        pnl = -risk
                    sims[k] = (pnl - cost) / risk
                    sims["cost_r"] = cost / risk
            recs.append({"day": i, "broke": True, "side": side, "minutes_to_break": int(ms[bi] - w),
                         "or_adr": orr / adr, "close_side": bool(close_side), "race_win": race_win, "race_null": race_null,
                         "false_break": other_taken, "mfe_or": mfe / orr, "mae_or": mae / orr,
                         "mfe_adr": mfe / adr, "risk_adr": risk / adr, "sims": sims,
                         "dow": DOW_NAMES[days.trade_dow[i]], "regime": vol_regime(days, i), "year": int(days.year[i]),
                         "news": getattr(days, "news", [None] * days.n)[i],
                         "early": ms[bi] - w <= 30})
        broke = [r for r in recs if r["broke"]]
        n_all = len(recs)
        res = {"n_days": n_all, "breakout_rate": prop_ci(len(broke), n_all),
               "minutes_to_break": summarize([r["minutes_to_break"] for r in broke], 1),
               "or_size_adr": summarize([r["or_adr"] for r in recs]),
               "day_closes_on_breakout_side": prop_ci(sum(r["close_side"] for r in broke), len(broke)),
               "false_breakout_both_sides_taken": prop_ci(sum(r["false_break"] for r in broke), len(broke)),
               "mfe_in_or_units": summarize([r["mfe_or"] for r in broke]),
               "mae_in_or_units": summarize([r["mae_or"] for r in broke]),
               "mfe_in_adr_units": summarize([r["mfe_adr"] for r in broke]),
               "risk_in_adr_units_stop_" + stop_mode: summarize([r["risk_adr"] for r in broke])}
        raced = [r for r in broke if r["race_win"] is not None]
        res["race_plus1OR_before_opposite_edge"] = prop_ci(sum(r["race_win"] for r in raced), len(raced))
        res["race_plus1OR_before_opposite_edge"]["p_vs_50"] = binom_p(sum(r["race_win"] for r in raced), len(raced))
        res["race_plus1OR_before_opposite_edge"]["random_walk_null_pct"] = round(100 * float(np.mean([r["race_null"] for r in raced])), 1) if raced else None
        # sims
        res["sims"] = {}
        for k in targets:
            rs = [r["sims"][k] for r in broke if k in r["sims"]]
            res["sims"][f"target_{k}R_stop_{stop_mode}"] = trade_stats(rs, [r["sims"]["cost_r"] for r in broke if k in r["sims"]])
        is_, oos = is_oos(broke, "day", days.n)
        res["sims_is_oos"] = {lab: {f"target_{k}R": trade_stats([r["sims"][k] for r in rs if k in r["sims"]]) for k in targets}
                              for lab, rs in (("IS", is_), ("OOS", oos))}
        for lab, rs in (("IS", is_), ("OOS", oos)):
            raced2 = [r for r in rs if r["race_win"] is not None]
            res["sims_is_oos"][lab]["race_plus1OR"] = prop_ci(sum(r["race_win"] for r in raced2), len(raced2))
        # conditioning
        def cond(keyf, label):
            groups = {}
            for r in broke:
                groups.setdefault(keyf(r), []).append(r)
            res[label] = {}
            for g, rs in sorted(groups.items()):
                sims1 = [r["sims"][targets[0]] for r in rs if targets[0] in r["sims"]]
                res[label][g] = {"n": len(rs), "closes_on_side": prop_ci(sum(r["close_side"] for r in rs), len(rs)),
                                 "false_break": prop_ci(sum(r["false_break"] for r in rs), len(rs)),
                                 f"sim_{targets[0]}R": trade_stats(sims1)}
        cond(lambda r: bucketize(r["or_adr"], [0.1, 0.2, 0.35], ["<0.10 ADR", "0.10-0.20", "0.20-0.35", ">0.35 ADR"]), "by_or_size")
        cond(lambda r: r["dow"], "by_weekday")
        cond(lambda r: r["regime"], "by_vol_regime")
        cond(lambda r: r["year"], "by_year")
        cond(lambda r: "break<=30min" if r["early"] else "break>30min", "by_break_timing")
        cond(lambda r: r["side"], "by_side")
        cond(lambda r: "major news day" if r["news"] else ("no major news" if r["news"] is False else "unknown"), "by_news_day")
        out[f"or_{w}m"] = res
    return out
