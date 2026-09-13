"""
Study 6 - ASIA RANGE -> LONDON / NY, and PRIOR-DAY / PRIOR-WEEK LEVELS.

Sessions in UK wall-clock: Asia = daily open (23:00) -> 07:00; London =
07:00 -> 13:00; NY = 13:00 -> 21:00 (day end).

Asia range questions
  * P(London/NY takes Asia high, low, both, neither)
  * first side broken; P(day closes beyond it) = true break vs P(comes back
    through the range) = sweep; P(opposite side ALSO taken after the first
    break) = sweep-and-reverse
  * time from 07:00 to the first break; Asia range size vs ADR conditioning
  * sims: breakout (first close beyond, stop mid-range, target 1x range) and
    sweep-fade (after a break, first close back inside -> target the other
    side, stop beyond the sweep extreme)

Prior levels
  * PDH / PDL / PDC / PWH / PWL: touch rate during the day, and reaction at
    the FIRST touch (race: 0.15 ADR through vs 0.15 ADR back).
"""
from __future__ import annotations
import numpy as np
from .data import Days, DOW_NAMES, INSTRUMENTS, vol_regime
from .stats import prop_ci, summarize, trade_stats, bucketize, is_oos


def _first(mask, start=0):
    idx = np.flatnonzero(mask[start:])
    return start + int(idx[0]) if idx.size else None


def asia_range_study(days: Days, pair: str, asia_end=7.0) -> dict:
    cost = INSTRUMENTS[pair]["cost"]
    recs = []
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        lh = days.london_hours(i)
        adr = days.adr20[i]
        # Asia = bars from the day open until the London clock reaches asia_end
        # (the day starts at 23:00 UK, so hours 23..6.99 belong to Asia)
        a_end = _first((lh >= asia_end) & (lh < 20.0))   # the day starts 23:00 UK, so guard the wrap
        if a_end is None or a_end < 120 or a_end > len(c) - 120:
            continue
        ah = h[:a_end].max(); al = l[:a_end].min(); ar = ah - al
        if ar <= 0:
            continue
        rest_h = h[a_end:]; rest_l = l[a_end:]; rest_c = c[a_end:]; rest_ms = ms[a_end:]
        iu = _first(rest_c > ah); idn = _first(rest_c < al)
        took_hi = iu is not None; took_lo = idn is not None
        rec = {"day": i, "ar_adr": ar / adr, "took_hi": took_hi, "took_lo": took_lo, "year": int(days.year[i]),
               "dow": DOW_NAMES[days.trade_dow[i]], "regime": vol_regime(days, i), "news": getattr(days, "news", [None] * days.n)[i]}
        if took_hi or took_lo:
            first_up = took_hi and (not took_lo or iu < idn)
            j = iu if first_up else idn
            rec["first_side"] = "high" if first_up else "low"
            rec["min_to_first_break"] = int(rest_ms[j] - rest_ms[0])
            level = ah if first_up else al; sgn = 1 if first_up else -1
            rec["close_beyond"] = bool(sgn * (c[-1] - level) > 0)
            rec["opposite_taken_after"] = bool((rest_c[j + 1:] < al).any()) if first_up else bool((rest_c[j + 1:] > ah).any())
            rec["back_inside_after"] = bool((rest_c[j + 1:] < ah).any()) if first_up else bool((rest_c[j + 1:] > al).any())
            rec["mfe_range_units"] = float(((rest_h[j + 1:].max() - level) if first_up else (level - rest_l[j + 1:].min())) / ar) if j + 1 < len(rest_c) else 0.0
            # breakout sim
            entry = rest_c[j]; stop = (ah + al) / 2; risk = abs(entry - stop); tgt = level + sgn * ar
            if risk > 0 and j + 1 < len(rest_c):
                hh = rest_h[j + 1:]; ll = rest_l[j + 1:]
                ti = _first(hh >= tgt) if first_up else _first(ll <= tgt)
                si = _first(ll <= stop) if first_up else _first(hh >= stop)
                ti = np.inf if ti is None else ti; si = np.inf if si is None else si
                if ti == np.inf and si == np.inf:
                    pnl = (c[-1] - entry) * sgn
                elif ti <= si:
                    pnl = abs(tgt - entry)
                else:
                    pnl = -risk
                rec["sim_breakout"] = (pnl - cost) / risk; rec["cost_r_b"] = cost / risk
            # sweep-fade sim: after first break, wait for first close back inside; enter, stop beyond the sweep extreme so far, target the opposite side
            bi = _first(rest_c[j + 1:] < ah) if first_up else _first(rest_c[j + 1:] > al)
            if bi is not None:
                jb = j + 1 + bi
                sweep_ext = rest_h[j:jb + 1].max() if first_up else rest_l[j:jb + 1].min()
                entry = rest_c[jb]; stop = sweep_ext + sgn * 0.05 * ar; tgt = al if first_up else ah
                risk = abs(stop - entry); reward = abs(entry - tgt)
                if risk > 0 and reward > 0 and jb + 1 < len(rest_c):
                    hh = rest_h[jb + 1:]; ll = rest_l[jb + 1:]
                    ti = _first(ll <= tgt) if first_up else _first(hh >= tgt)
                    si = _first(hh >= stop) if first_up else _first(ll <= stop)
                    ti = np.inf if ti is None else ti; si = np.inf if si is None else si
                    if ti == np.inf and si == np.inf:
                        pnl = (c[-1] - entry) * -sgn
                    elif ti <= si:
                        pnl = reward
                    else:
                        pnl = -risk
                    rec["sim_sweep_fade"] = (pnl - cost) / risk; rec["cost_r_s"] = cost / risk
                    rec["sweep_fade_rr"] = reward / risk
        recs.append(rec)
    n = len(recs)
    broke = [r for r in recs if "first_side" in r]
    out = {"n_days": n, "asia_range_adr": summarize([r["ar_adr"] for r in recs]),
           "outcome": {"high_only": prop_ci(sum(r["took_hi"] and not r["took_lo"] for r in recs), n),
                       "low_only": prop_ci(sum(r["took_lo"] and not r["took_hi"] for r in recs), n),
                       "both": prop_ci(sum(r["took_hi"] and r["took_lo"] for r in recs), n),
                       "neither": prop_ci(sum(not r["took_hi"] and not r["took_lo"] for r in recs), n)},
           "minutes_from_0700_to_first_break": summarize([r["min_to_first_break"] for r in broke], 0),
           "after_first_break": {"day_closes_beyond_broken_side": prop_ci(sum(r["close_beyond"] for r in broke), len(broke)),
                                 "closes_back_inside_at_some_point": prop_ci(sum(r["back_inside_after"] for r in broke), len(broke)),
                                 "opposite_side_also_taken": prop_ci(sum(r["opposite_taken_after"] for r in broke), len(broke)),
                                 "mfe_in_asia_range_units": summarize([r["mfe_range_units"] for r in broke])},
           "sims": {"breakout_stop_mid_target_1x": trade_stats([r["sim_breakout"] for r in broke if "sim_breakout" in r], [r["cost_r_b"] for r in broke if "sim_breakout" in r]),
                    "sweep_fade_to_other_side": trade_stats([r["sim_sweep_fade"] for r in broke if "sim_sweep_fade" in r], [r["cost_r_s"] for r in broke if "sim_sweep_fade" in r]),
                    "sweep_fade_avg_rr": summarize([r["sweep_fade_rr"] for r in broke if "sweep_fade_rr" in r])}}
    is_, oos = is_oos(broke, "day", days.n)
    out["sims_is_oos"] = {}
    for lab, rs in (("IS", is_), ("OOS", oos)):
        out["sims_is_oos"][lab] = {"breakout": trade_stats([r["sim_breakout"] for r in rs if "sim_breakout" in r]),
                                   "sweep_fade": trade_stats([r["sim_sweep_fade"] for r in rs if "sim_sweep_fade" in r]),
                                   "closes_beyond": prop_ci(sum(r["close_beyond"] for r in rs), len(rs))}

    def cond(keyf, label):
        out[label] = {}
        groups = {}
        for r in broke:
            groups.setdefault(keyf(r), []).append(r)
        for g, rs in sorted(groups.items()):
            if len(rs) < 30:
                continue
            out[label][g] = {"n": len(rs), "closes_beyond": prop_ci(sum(r["close_beyond"] for r in rs), len(rs)),
                             "opposite_also_taken": prop_ci(sum(r["opposite_taken_after"] for r in rs), len(rs)),
                             "sim_breakout": trade_stats([r["sim_breakout"] for r in rs if "sim_breakout" in r]),
                             "sim_sweep_fade": trade_stats([r["sim_sweep_fade"] for r in rs if "sim_sweep_fade" in r])}
    cond(lambda r: bucketize(r["ar_adr"], [0.25, 0.4, 0.6], ["<0.25 ADR", "0.25-0.40", "0.40-0.60", ">0.60 ADR"]), "by_asia_range_size")
    cond(lambda r: r["dow"], "by_weekday")
    cond(lambda r: r["regime"], "by_vol_regime")
    cond(lambda r: r["year"], "by_year")
    cond(lambda r: "major news day" if r["news"] else ("no major news" if r["news"] is False else "unknown"), "by_news_day")
    cond(lambda r: "break<=60min" if r["min_to_first_break"] <= 60 else ("60-180min" if r["min_to_first_break"] <= 180 else ">180min"), "by_break_timing")
    return out


def prior_levels_study(days: Days) -> dict:
    lv = {"PDH": [], "PDL": [], "PDC": [], "PWH": [], "PWL": []}
    # weekly levels: previous Mon..Fri trade-days (trade_dow 0..4)
    week_id = np.zeros(days.n, dtype=int)
    wk = 0
    for i in range(days.n):
        if i > 0 and days.trade_dow[i] < days.trade_dow[i - 1]:
            wk += 1
        week_id[i] = wk
    wk_hi = {}; wk_lo = {}
    for w in range(wk + 1):
        m = week_id == w
        wk_hi[w] = days.d_high[m].max(); wk_lo[w] = days.d_low[m].min()
    for i in range(1, days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        adr = days.adr20[i]; op = o[0]
        levels = {"PDH": days.d_high[i - 1], "PDL": days.d_low[i - 1], "PDC": days.d_close[i - 1]}
        if week_id[i] > 0:
            pw = week_id[i] - 1
            levels["PWH"] = wk_hi[pw]; levels["PWL"] = wk_lo[pw]
        for name, px in levels.items():
            above = op > px      # level is below the open
            dist = abs(op - px) / adr
            if dist < 0.02:
                continue       # opened on top of it; no approach to study
            j = _first(l <= px) if above else _first(h >= px)
            rec = {"dist_adr": dist, "touched": j is not None, "t": None, "reaction": None}
            if j is not None and j + 1 < len(c):
                rec["t"] = int(ms[j])
                through = px - 0.15 * adr if above else px + 0.15 * adr
                back = px + 0.15 * adr if above else px - 0.15 * adr
                ti = _first(l[j + 1:] <= through) if above else _first(h[j + 1:] >= through)
                bi = _first(h[j + 1:] >= back) if above else _first(l[j + 1:] <= back)
                ti = np.inf if ti is None else ti; bi = np.inf if bi is None else bi
                if ti == np.inf and bi == np.inf:
                    rec["reaction"] = "neither"
                else:
                    rec["reaction"] = "break" if ti < bi else "reject"
                rec["close_beyond"] = bool((c[-1] < px) if above else (c[-1] > px))
            lv[name].append(rec)
    out = {}
    for name, rs in lv.items():
        n = len(rs); t = [r for r in rs if r["touched"]]
        reacted = [r for r in t if r["reaction"] in ("break", "reject")]
        d = {"n_days_level_away_from_open": n, "touched_during_day": prop_ci(len(t), n),
             "distance_from_open_adr": summarize([r["dist_adr"] for r in rs]),
             "minutes_to_touch": summarize([r["t"] for r in t], 0),
             "first_touch_reaction": {"reject_0.15ADR_first": prop_ci(sum(r["reaction"] == "reject" for r in reacted), len(reacted)),
                                      "break_0.15ADR_first": prop_ci(sum(r["reaction"] == "break" for r in reacted), len(reacted)),
                                      "unresolved": prop_ci(sum(r["reaction"] == "neither" for r in t), len(t))},
             "day_closes_beyond_after_touch": prop_ci(sum(r.get("close_beyond", False) for r in t), len(t)), "touch_rate_by_distance": {}}
        for lab, lo, hi in (("<0.25 ADR", 0, 0.25), ("0.25-0.5", 0.25, 0.5), ("0.5-1.0", 0.5, 1.0), (">1.0 ADR", 1.0, 99)):
            xs = [r for r in rs if lo <= r["dist_adr"] < hi]
            if len(xs) >= 30:
                tx = [r for r in xs if r["touched"]]; rx = [r for r in tx if r["reaction"] in ("break", "reject")]
                d["touch_rate_by_distance"][lab] = {"n": len(xs), "touched": prop_ci(len(tx), len(xs)),
                                                    "reject_first": prop_ci(sum(r["reaction"] == "reject" for r in rx), len(rx))}
        out[name] = d
    return out
