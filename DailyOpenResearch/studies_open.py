"""
Study 3 - THE OPEN AS A LEVEL, and where the day's extremes form.

  * first-move direction (first 15/30/60 min) vs day close direction
  * time-of-day of the day's high and low (in 30-min buckets after the open)
  * how many times price crosses the open in a day; % of bars above the open
  * "open holds" - once price is X ADR away from the open, probability it
    never comes back to the open that day (a direct measure of whether the
    open acts as support/resistance or just a magnet)
  * initial balance / first-hour extremes: P(day's low is inside the first
    hour | day closes up) - the "Judas swing" claim (early stop-run then trend)
  * gap at the open (gold/NQ): gap size vs prior close, and gap-fill rate
"""
from __future__ import annotations
import numpy as np
from .data import Days, DOW_NAMES, vol_regime
from .stats import prop_ci, summarize, binom_p, bucketize


def open_level_study(days: Days) -> dict:
    fm = {w: {"agree": 0, "n": 0, "agree_rest": 0, "n_rest": 0} for w in (15, 30, 60, 120)}
    hi_bucket = np.zeros(48); lo_bucket = np.zeros(48); nb = 0
    crosses = []; above_share = []
    holds = {x: {"never_back": 0, "n": 0, "min_to_back": []} for x in (0.1, 0.2, 0.3, 0.5)}
    judas = {"up_close_low_in_first60": 0, "up_close_n": 0, "down_close_high_in_first60": 0, "down_close_n": 0}
    gaps = []
    close_vs_open = []
    trend = {}   # checkpoint -> travel bucket -> counts
    rng = np.random.default_rng(11)
    judas_null = {"up_close_low_in_first60": 0, "up_close_n": 0, "down_close_high_in_first60": 0, "down_close_n": 0}
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        adr = days.adr20[i]; op = o[0]; dc = c[-1] - op
        close_vs_open.append(dc / adr)
        for w in fm:
            m = ms < w
            if m.any():
                f = c[m][-1] - op
                if f != 0 and dc != 0:
                    fm[w]["agree"] += int(np.sign(f) == np.sign(dc)); fm[w]["n"] += 1
                rest = c[-1] - c[m][-1]   # overlap-free: from the window close to the day close
                if f != 0 and rest != 0:
                    fm[w]["agree_rest"] += int(np.sign(f) == np.sign(rest)); fm[w]["n_rest"] += 1
        hb = min(47, int(ms[h.argmax()] // 30)); lb = min(47, int(ms[l.argmin()] // 30))
        hi_bucket[hb] += 1; lo_bucket[lb] += 1; nb += 1
        s = np.sign(c - op); s = s[s != 0]
        crosses.append(int((np.diff(s) != 0).sum()))
        above_share.append(float((c > op).mean()))
        # open holds: first time |price-open| >= x*ADR, then does it return to the open?
        for x in holds:
            away = np.flatnonzero((h - op >= x * adr) | (op - l >= x * adr))
            if not away.size:
                continue
            k = away[0]; up = h[k] - op >= x * adr
            back = np.flatnonzero((l[k + 1:] <= op) if up else (h[k + 1:] >= op))
            holds[x]["n"] += 1
            if back.size:
                holds[x]["min_to_back"].append(int(ms[k + 1 + back[0]] - ms[k]))
            else:
                holds[x]["never_back"] += 1
        if dc > 0:
            judas["up_close_n"] += 1; judas["up_close_low_in_first60"] += int(ms[l.argmin()] < 60)
        elif dc < 0:
            judas["down_close_n"] += 1; judas["down_close_high_in_first60"] += int(ms[h.argmax()] < 60)
        # shuffled-returns null: same 1m close-to-close moves in random order -> same drift, no time-of-day structure
        rets = np.diff(c); rng.shuffle(rets); sc = op + np.concatenate([[0.0], np.cumsum(rets)])
        sdc = sc[-1] - op
        if sdc > 0:
            judas_null["up_close_n"] += 1; judas_null["up_close_low_in_first60"] += int(ms[sc.argmin()] < 60)
        elif sdc < 0:
            judas_null["down_close_n"] += 1; judas_null["down_close_high_in_first60"] += int(ms[sc.argmax()] < 60)
        # trend-day checkpoints: at 07:00 and 13:00 UK, how far has price travelled from the open,
        # is it AT the extreme of the day so far, and does the day then close further along?
        lh = days.london_hours(i)
        for cp_h, cp_lab in ((7.0, "0700UK"), (13.0, "1300UK")):
            jj = np.flatnonzero((lh >= cp_h) & (lh < 20.0))
            if not jj.size or jj[0] < 60 or jj[0] > len(c) - 120:
                continue
            j = int(jj[0]); travel = (c[j] - op) / adr; sgn = np.sign(travel)
            if sgn == 0:
                continue
            rng_so_far = h[:j + 1].max() - l[:j + 1].min()
            at_ext = ((h[:j + 1].max() - c[j]) if sgn > 0 else (c[j] - l[:j + 1].min())) <= 0.15 * rng_so_far
            tb = bucketize(abs(travel), [0.15, 0.3, 0.5], ["<0.15 ADR", "0.15-0.30", "0.30-0.50", ">0.50 ADR"])
            key = (cp_lab, tb, "at extreme" if at_ext else "off extreme")
            t = trend.setdefault(key, {"n": 0, "further": 0, "back_through_open": 0, "mfe": []})
            t["n"] += 1
            t["further"] += int(sgn * (c[-1] - c[j]) > 0)
            t["back_through_open"] += int(sgn * (c[-1] - op) < 0)
            t["mfe"].append(float(sgn * ((h[j + 1:].max() - c[j]) if sgn > 0 else (c[j] - l[j + 1:].min())) / adr))
        if i > 0:
            pc = days.d_close[i - 1]
            gap = op - pc
            if gap != 0:
                filled = bool((l <= pc).any()) if gap > 0 else bool((h >= pc).any())
                t_fill = None
                if filled:
                    k = np.flatnonzero(l <= pc)[0] if gap > 0 else np.flatnonzero(h >= pc)[0]
                    t_fill = int(ms[k])
                gaps.append({"gap_adr": gap / adr, "filled": filled, "t_fill": t_fill, "dow": DOW_NAMES[days.trade_dow[i]]})
    out = {"first_move_vs_day_close": {}, "first_move_vs_rest_of_day": {}}
    for w, r in fm.items():
        ci = prop_ci(r["agree"], r["n"]); ci["p_vs_50"] = binom_p(r["agree"], r["n"]); out["first_move_vs_day_close"][f"first_{w}m"] = ci
        ci = prop_ci(r["agree_rest"], r["n_rest"]); ci["p_vs_50"] = binom_p(r["agree_rest"], r["n_rest"]); out["first_move_vs_rest_of_day"][f"first_{w}m"] = ci
    out["day_high_time_30min_buckets_pct"] = {int(b * 30): round(100 * hi_bucket[b] / nb, 1) for b in range(48) if hi_bucket[b] or lo_bucket[b]}
    out["day_low_time_30min_buckets_pct"] = {int(b * 30): round(100 * lo_bucket[b] / nb, 1) for b in range(48) if hi_bucket[b] or lo_bucket[b]}
    out["open_crosses_per_day"] = summarize(crosses, 1)
    out["share_of_bars_above_open"] = summarize(above_share)
    out["close_minus_open_adr"] = summarize(close_vs_open)
    out["open_holds_after_move_away"] = {}
    for x, r in holds.items():
        out["open_holds_after_move_away"][f"{x}_ADR"] = {"never_returns_to_open": prop_ci(r["never_back"], r["n"]),
                                                       "minutes_until_return_when_it_does": summarize(r["min_to_back"], 0)}
    out["judas_swing"] = {"P(day low in first 60m | up close)": prop_ci(judas["up_close_low_in_first60"], judas["up_close_n"]),
                          "P(day high in first 60m | down close)": prop_ci(judas["down_close_high_in_first60"], judas["down_close_n"]),
                          "shuffled_null_P(low in first 60m | up close)": prop_ci(judas_null["up_close_low_in_first60"], judas_null["up_close_n"]),
                          "shuffled_null_P(high in first 60m | down close)": prop_ci(judas_null["down_close_high_in_first60"], judas_null["down_close_n"])}
    out["trend_day_checkpoints"] = {}
    for (cp, tb, ex), t in sorted(trend.items()):
        if t["n"] < 30:
            continue
        out["trend_day_checkpoints"].setdefault(cp, {}).setdefault(tb, {})[ex] = {
            "n": t["n"], "day_closes_further_in_direction": prop_ci(t["further"], t["n"]),
            "day_closes_back_through_open": prop_ci(t["back_through_open"], t["n"]),
            "further_mfe_adr": summarize(t["mfe"])}
    if gaps:
        g = {"n": len(gaps), "gap_abs_adr": summarize([abs(x["gap_adr"]) for x in gaps]),
             "fill_rate": prop_ci(sum(x["filled"] for x in gaps), len(gaps)),
             "minutes_to_fill": summarize([x["t_fill"] for x in gaps if x["filled"]], 0), "by_size": {}, "by_weekday": {}}
        for lab, lo, hi in (("<0.05 ADR", 0, 0.05), ("0.05-0.15", 0.05, 0.15), ("0.15-0.30", 0.15, 0.30), (">0.30 ADR", 0.30, 99)):
            xs = [x for x in gaps if lo <= abs(x["gap_adr"]) < hi]
            if xs:
                g["by_size"][lab] = {"fill_rate": prop_ci(sum(x["filled"] for x in xs), len(xs)),
                                     "fill_within_60m": prop_ci(sum(1 for x in xs if x["filled"] and x["t_fill"] <= 60), len(xs))}
        for d in DOW_NAMES[:5]:
            xs = [x for x in gaps if x["dow"] == d]
            if xs:
                g["by_weekday"][d] = {"gap_abs_adr_median": summarize([abs(x["gap_adr"]) for x in xs])["median"],
                                      "fill_rate": prop_ci(sum(x["filled"] for x in xs), len(xs))}
        out["gap_at_open"] = g
    return out
