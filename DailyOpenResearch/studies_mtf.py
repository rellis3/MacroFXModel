"""
Study 7 - MULTI-TIMEFRAME FIRST CANDLE.

For the first candle of the day on 5m / 15m / 30m / 1h / 4h:
  * direction (close vs open) and body ratio (|body| / range)
  * P(rest of day, from that candle's close to the day close, goes the same
    way)  - overlap-free
  * P(the candle's opposite extreme is never taken for the rest of the day)
    (e.g. bullish first-15m candle: does its low hold?)
  * P(the candle's extreme in the close direction is exceeded) - i.e. does
    the day extend beyond the first candle in its direction?
  * conditioning on body ratio (strong body vs doji) and on candle range vs ADR
"""
from __future__ import annotations
import numpy as np
from .data import Days
from .stats import prop_ci, summarize, binom_p, bucketize


def mtf_first_candle_study(days: Days, tfs=(5, 15, 30, 60, 240)) -> dict:
    out = {}
    for tf in tfs:
        recs = []
        for i in range(days.n):
            if not days.valid(i) or days.is_weekend_day(i):
                continue
            o, h, l, c, v, ms = days.arrays(i)
            m = ms < tf
            k = int(m.sum())
            if k < max(2, tf // 2) or k >= len(c) - 60:
                continue
            co, ch, cl, cc = o[0], h[m].max(), l[m].min(), c[k - 1]
            rng = ch - cl
            if rng <= 0 or cc == co:
                continue
            up = cc > co
            body = abs(cc - co) / rng
            rest = c[-1] - cc
            same = np.sign(rest) == (1 if up else -1) if rest != 0 else None
            opp_held = not ((l[k:] < cl).any() if up else (h[k:] > ch).any())
            extended = bool((h[k:] > ch).any() if up else (l[k:] < cl).any())
            # extension magnitude in candle-range units in the close direction
            ext = ((h[k:].max() - ch) if up else (cl - l[k:].min())) / rng
            recs.append({"up": up, "body": body, "rng_adr": rng / days.adr20[i], "same": same, "opp_held": opp_held,
                         "extended": extended, "ext": max(ext, 0.0), "year": int(days.year[i])})
        n = len(recs); s = [r for r in recs if r["same"] is not None]
        ci = prop_ci(sum(r["same"] for r in s), len(s)); ci["p_vs_50"] = binom_p(sum(r["same"] for r in s), len(s))
        d = {"n": n, "rest_of_day_same_direction": ci, "opposite_extreme_holds_all_day": prop_ci(sum(r["opp_held"] for r in recs), n),
             "day_extends_beyond_candle_in_its_direction": prop_ci(sum(r["extended"] for r in recs), n),
             "extension_in_candle_range_units": summarize([r["ext"] for r in recs]),
             "body_ratio": summarize([r["body"] for r in recs]), "candle_range_adr": summarize([r["rng_adr"] for r in recs]),
             "by_body_ratio": {}, "by_range_adr": {}, "by_year": {}}
        for lab, lo, hi in (("doji <0.3", 0, 0.3), ("0.3-0.6", 0.3, 0.6), ("strong >0.6", 0.6, 1.01)):
            xs = [r for r in s if lo <= r["body"] < hi]
            if len(xs) >= 30:
                d["by_body_ratio"][lab] = {"n": len(xs), "rest_same": prop_ci(sum(r["same"] for r in xs), len(xs)),
                                          "opp_held": prop_ci(sum(r["opp_held"] for r in xs), len(xs))}
        for lab, lo, hi in (("small <0.1 ADR", 0, 0.1), ("0.1-0.2", 0.1, 0.2), ("0.2-0.35", 0.2, 0.35), ("large >0.35", 0.35, 99)):
            xs = [r for r in s if lo <= r["rng_adr"] < hi]
            if len(xs) >= 30:
                d["by_range_adr"][lab] = {"n": len(xs), "rest_same": prop_ci(sum(r["same"] for r in xs), len(xs)),
                                         "opp_held": prop_ci(sum(r["opp_held"] for r in xs), len(xs))}
        for y in sorted({r["year"] for r in s}):
            xs = [r for r in s if r["year"] == y]
            d["by_year"][y] = {"n": len(xs), "rest_same_pct": prop_ci(sum(r["same"] for r in xs), len(xs))["p"]}
        out[f"{tf}m"] = d
    return out
