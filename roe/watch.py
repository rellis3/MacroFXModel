"""Watch items: evaluate every item in roe/watch_config.json as of one date, causally. One ItemResult per (item, instance):

  {id, group (the owner's top-10 number or None), kind, status ok|building|missing|partial|no_data, obsDate,
   measures, fired: [{trigger, side, variant?, strength}], flags: ['STALE:VIX9D', ...], inputs: [...], serverReference,
   triggersEvaluated, notes}

Nothing here reads a forward value, computes an outcome, or scores anything (ROE section 8). Derived series (ratios,
IV-minus-RV, dR/dt) are built AFTER truncating their inputs to the as-of date.
"""
from __future__ import annotations

import datetime as dt
import math

import numpy as np

from . import triggers as T
from .freshness import flag_strings, series_flags
from .measures import compute_measures
from .series import Series
from .util import add_sessions


class Ctx:
    def __init__(self, cfg, inputs, now_utc, prior_tails=None, prior_points=None):
        self.cfg = cfg
        self.inp = inputs
        self.now = now_utc
        self.prior_tails = prior_tails or {}
        self.prior_points = prior_points or {}
        self._tr, self._fl = {}, {}

    def series(self, sid, date):
        k = (sid, date)
        if k not in self._tr:
            s = self.inp.series.get(sid)
            t = s.truncate(date) if s is not None else None
            if t is not None:
                # FUTURE_TS means the SOURCE held future-dated points (counted by the loader at the run's as-of date);
                # cutting back to an earlier look-back date is not an unexpected timestamp.
                t.meta["droppedAfterTo"] = s.meta.get("droppedAfterTo", 0)
            self._tr[k] = t
        return self._tr[k]

    def flags(self, sid, date):
        k = (sid, date)
        if k not in self._fl:
            s = self.series(sid, date)
            self._fl[k] = series_flags(s, date, self.now, self.cfg, self.prior_tails.get(sid))
        return self._fl[k]

    def flag_strings(self, sids, date):
        out = []
        for sid in sids:
            out += flag_strings(sid, self.flags(sid, date))
        return out


def obs_date(s: Series):
    return s.known[-1] if s.known else s.dates[-1]


def _join(a: Series, b: Series):
    bm = dict(zip(b.dates, b.values))
    d = [x for x in a.dates if x in bm]
    am = dict(zip(a.dates, a.values))
    return d, np.array([am[x] for x in d], float), np.array([bm[x] for x in d], float)


def make_ratio(a: Series, b: Series, sid: str):
    d, av, bv = _join(a, b)
    ok = bv != 0
    s = Series(sid, [x for x, o in zip(d, ok) if o], list((av[ok] / bv[ok])), source=f"derived:{a.id}/{b.id}", kind="derived")
    s.meta["derived"] = True
    return s


def make_ivrv(iv: Series, px: Series, w: int, sid: str):
    if len(px.values) < w + 2:
        return None
    p = np.asarray(px.values, float)
    r = np.diff(np.log(p))
    win = np.lib.stride_tricks.sliding_window_view(r, w)
    rv = win.std(axis=1, ddof=1) * math.sqrt(252) * 100.0       # rv at price index j+w
    rvm = {px.dates[j + w]: rv[j] for j in range(len(rv))}
    rows = [(d, math.log(v / rvm[d])) for d, v in zip(iv.dates, iv.values) if d in rvm and v > 0 and rvm[d] > 0]
    s = Series(sid, [d for d, _ in rows], [x for _, x in rows], source=f"derived:ln({iv.id}/RV{w}({px.id}))", kind="derived")
    s.meta["derived"] = True
    return s


def make_drdt(num: Series, den: Series, smooth: int, lag: int, sid: str):
    ratio = make_ratio(num, den, "R")
    v = np.asarray(ratio.values, float)
    if v.size < smooth + lag + 1:
        return None
    cs = np.cumsum(np.insert(v, 0, 0.0))
    r20 = (cs[smooth:] - cs[:-smooth]) / smooth          # r20[i] ends at ratio index i+smooth-1
    d20 = ratio.dates[smooth - 1:]
    dr = r20[lag:] - r20[:-lag]
    s = Series(sid, d20[lag:], list(dr), source=f"derived:dR/dt({num.id}/{den.id})", kind="derived")
    s.meta["derived"] = True
    return s


# ------------------------------------------------------------------------------------------------------------ helpers
def _res(entry, rid, kind, **kw):
    r = {"id": rid, "group": entry.get("top10"), "kind": kind, "status": "ok", "fired": [], "flags": [], "inputs": [],
         "measures": None, "obsDate": None, "serverReference": None, "triggersEvaluated": 0, "notes": []}
    r.update(kw)
    return r


def _missing(entry, rid, kind, inputs, ctx, date, why):
    r = _res(entry, rid, kind, status="missing", inputs=inputs, notes=[why])
    r["flags"] = [f"MISSING:{i}" for i in inputs if ctx.series(i, date) is None or not ctx.series(i, date).dates]
    return r


def series_item(ctx, date, entry, rid, s: Series, inputs, *, server=None, extra_triggers=None):
    cfg = ctx.cfg
    m = compute_measures(s.dates, s.values, cadence=s.cadence, change_kind=s.change_kind, cfg=cfg)
    r = _res(entry, rid, entry["kind"], status=m["status"], measures=m, obsDate=obs_date(s), inputs=inputs,
             serverReference=server, flags=ctx.flag_strings(inputs, date))
    if m["status"] == "missing":
        return r
    for tname in entry["triggers"]:
        r["triggersEvaluated"] += 1
        if tname == "extreme":
            r["fired"] += T.extreme(m, cfg)
        elif tname == "speed":
            r["fired"] += T.speed(m, cfg)
        elif tname == "flip":
            r["fired"] += T.flip(s.values, entry.get("center", 0.0), cfg)
        elif tname == "regime" and entry.get("regimeCuts"):
            rc = entry["regimeCuts"]
            labs = T.regime_labels(s.values[-(cfg["triggers"]["regime"]["hold"] + 1):], rc["values"], rc["labels"])
            r["fired"] += T.regime_change(labs, cfg, {"cuts": rc["values"], "value": s.values[-1]})
    return r


# ------------------------------------------------------------------------------------------------------------ evaluate
def evaluate(ctx: Ctx, date: str, *, include_points: bool) -> list:
    out = []
    cfg = ctx.cfg
    for entry in cfg["items"]:
        fn = KINDS.get(entry["kind"])
        if fn is None or entry.get("enabled") is False:
            continue
        out += fn(ctx, date, entry, include_points)
    return out


def k_series(ctx, date, entry, pts):
    sid = entry["series"]
    s = ctx.series(sid, date)
    if s is None or not s.dates:
        return [_missing(entry, entry["id"], "series", [sid], ctx, date, f"series {sid} not available")]
    return [series_item(ctx, date, entry, entry["id"], s, [sid], server=ctx.inp.server_ref.get(sid))]


def k_ratio(ctx, date, entry, pts):
    a, b = ctx.series(entry["num"], date), ctx.series(entry["den"], date)
    ins = [entry["num"], entry["den"]]
    if a is None or b is None or not a.dates or not b.dates:
        return [_missing(entry, entry["id"], "ratio", ins, ctx, date, "numerator or denominator not available")]
    s = make_ratio(a, b, entry["id"])
    s.change_kind = "diff"
    if not s.dates:
        return [_missing(entry, entry["id"], "ratio", ins, ctx, date, "no common dates")]
    return [series_item(ctx, date, entry, entry["id"], s, ins)]


def k_drdt(ctx, date, entry, pts):
    a, b = ctx.series(entry["num"], date), ctx.series(entry["den"], date)
    ins = [entry["num"], entry["den"]]
    if a is None or b is None or not a.dates or not b.dates:
        return [_missing(entry, entry["id"], "drdt", ins, ctx, date, "numerator or denominator not available")]
    s = make_drdt(a, b, entry["smooth"], entry["lag"], entry["id"])
    if s is None:
        return [_missing(entry, entry["id"], "drdt", ins, ctx, date, "too short")]
    return [series_item(ctx, date, entry, entry["id"], s, ins)]


def k_ivrv(ctx, date, entry, pts):
    iv, px = ctx.series(entry["iv"], date), ctx.series(entry["px"], date)
    ins = [entry["iv"], entry["px"]]
    if iv is None or px is None or not iv.dates or not px.dates:
        return [_missing(entry, entry["id"], "ivrv", ins, ctx, date, "implied vol or price series not available")]
    s = make_ivrv(iv, px, entry["rvWindow"], entry["id"])
    if s is None or not s.dates:
        return [_missing(entry, entry["id"], "ivrv", ins, ctx, date, "no overlap between IV and price history")]
    return [series_item(ctx, date, entry, entry["id"], s, ins)]


def k_cot(ctx, date, entry, pts):
    out = []
    for sym in entry["symbols"]:
        sid = f"COT:{sym}"
        s = ctx.series(sid, date)
        if s is None or not s.dates:
            out.append(_missing(entry, f"{entry['id']}:{sym}", "cot", [sid], ctx, date, f"{sid} not available"))
            continue
        out.append(series_item(ctx, date, entry, f"{entry['id']}:{sym}", s, [sid], server=ctx.inp.server_ref.get(sid)))
    return out


def k_cot_release(ctx, date, entry, pts):
    out = []
    cal = ctx.inp.calendar
    end = add_sessions(date, entry["windowSessions"])
    cal_short = (not ctx.inp.calendar_loaded) or (not cal) or max(e["date"] for e in cal) < end
    for ccy in entry["currencies"]:
        sid = f"COT:{ccy}"
        s = ctx.series(sid, date)
        rid = f"{entry['id']}:{ccy}"
        if s is None or not s.dates:
            out.append(_missing(entry, rid, "cot_release", [sid], ctx, date, f"{sid} not available"))
            continue
        m = compute_measures(s.dates, s.values, cadence="weekly", change_kind="diff", cfg=ctx.cfg)
        r = _res(entry, rid, "cot_release", status=m["status"], measures=m, obsDate=date, inputs=[sid],
                 flags=ctx.flag_strings([sid], date) + (["STALE:calendar"] if cal_short else []),
                 serverReference=ctx.inp.server_ref.get(sid), triggersEvaluated=1)
        p = (m.get("pct") or {}).get(str(m["windows"][-1])) if m["status"] != "missing" else None
        evs = [e for e in cal if e["ccy"] == ccy and e["impact"] == entry["impact"] and date <= e["date"] <= end]
        r["measures"]["releasesInWindow"] = len(evs)
        if p is not None and evs:
            side = "high" if p >= entry["crowdUpper"] else ("low" if p <= entry["crowdLower"] else None)
            if side:
                r["fired"].append({"trigger": "extreme", "variant": "crowd_release", "side": f"{side}_into_release",
                                   "strength": {"pct156": p, "window": m["windows"][-1], "releases": [f"{e['date']} {e['event']}" for e in evs[:3]]}})
        out.append(r)
    return out


def k_hl_line(ctx, date, entry, pts):
    out = []
    t = entry
    insts = sorted(k.split(":", 1)[1] for k in ctx.inp.series if k.startswith("HL75:"))
    if not insts:
        return [_missing(entry, entry["id"], "hl_line", ["HL75"], ctx, date, "no realised-range vs shipped-line series (needs GET /api/vol-forecast/hit-rates or the laptop range csv)")]
    for inst in insts:
        s75, s50 = ctx.series(f"HL75:{inst}", date), ctx.series(f"HL50:{inst}", date)
        rid = f"{entry['id']}:{inst}"
        if s75 is None or not s75.dates:
            out.append(_missing(entry, rid, "hl_line", [f"HL75:{inst}"], ctx, date, "empty"))
            continue
        w5, w20 = t["shareWindows"]
        v = np.asarray(s75.values, float)
        m = {"status": "ok", "nObs": int(v.size), "asOfDate": s75.dates[-1], "share5": float((v[-w5:] > 1).mean()) if v.size >= w5 else None,
             "share20": float((v[-w20:] > 1).mean()) if v.size >= w20 else None, "nominalShareAboveP75": t["nominalShareHigh"],
             "lastRatioToP75": float(v[-1]), "definition": "share of the last k sessions whose realised HL exceeded the shipped p75 line (production forecast line used as a threshold only)"}
        r = _res(entry, rid, "hl_line", status="ok" if v.size >= w5 else "building", measures=m, obsDate=s75.dates[-1],
                 inputs=[f"HL75:{inst}", f"HL50:{inst}"], flags=ctx.flag_strings([f"HL75:{inst}"], date) + ["LOCKBOX_ADJACENT:shipped_line"],
                 triggersEvaluated=1)
        if m["share5"] is not None and m["share5"] >= t["minShareHigh"]:
            r["fired"].append({"trigger": "extreme", "variant": "exceedance_share", "side": "high",
                               "strength": {"share5": m["share5"], "share20": m["share20"], "nominal": t["nominalShareHigh"]}})
        if s50 is not None and len(s50.values) >= t["requireAllBelowP50Over"] and all(x < 1 for x in s50.values[-t["requireAllBelowP50Over"]:]):
            r["fired"].append({"trigger": "extreme", "variant": "all_below_p50", "side": "low",
                               "strength": {"sessions": t["requireAllBelowP50Over"]}})
        out.append(r)
    return out


def _class_label(d2, d10):
    if d2 == d10 or any(x is None or math.isnan(x) for x in (d2, d10)):
        return None
    mv = "bull" if (d2 + d10) / 2 < 0 else "bear"
    return f"{mv}_{'steepener' if d10 - d2 > 0 else 'flattener'}"


def k_curve_class(ctx, date, entry, pts):
    a, b = ctx.series(entry["y2"], date), ctx.series(entry["y10"], date)
    ins = [entry["y2"], entry["y10"]]
    if a is None or b is None or not a.dates or not b.dates:
        return [_missing(entry, entry["id"], "curve_class", ins, ctx, date, "2y or 10y yield not available")]
    d, v2, v10 = _join(a, b)
    k, hold = entry["horizon"], ctx.cfg["triggers"]["regime"]["hold"]
    if len(d) < k + hold + 1:
        return [_missing(entry, entry["id"], "curve_class", ins, ctx, date, "too short")]
    labs = [_class_label(v2[i] - v2[i - k], v10[i] - v10[i - k]) for i in range(len(d) - hold - 1, len(d))]
    r = _res(entry, entry["id"], "curve_class", measures={"status": "ok", "class": labs[-1], "chg20_2y": float(v2[-1] - v2[-1 - k]),
                                                              "chg20_10y": float(v10[-1] - v10[-1 - k]), "asOfDate": d[-1],
                                                              "note": "state label only (E04); no direction claim"},
             obsDate=d[-1], inputs=ins, flags=ctx.flag_strings(ins, date), triggersEvaluated=1)
    r["fired"] += T.regime_change(labs, ctx.cfg, {"chg20_2y": float(v2[-1] - v2[-1 - k]), "chg20_10y": float(v10[-1] - v10[-1 - k])})
    return [r]


def k_vol_breadth(ctx, date, entry, pts):
    comps, cnt, fresh, hot, stale_flags, missing = [], 0, 0, [], [], []
    for sid in entry["components"]:
        s = ctx.series(sid, date)
        fl = ctx.flags(sid, date)
        codes = {f["code"] for f in fl}
        if s is None or not s.dates:
            missing.append(sid)
            continue
        if "STALE" in codes:
            stale_flags.append(f"STALE:{sid}")
            continue
        m = compute_measures(s.dates, s.values, cadence="daily", change_kind="log", cfg=ctx.cfg)
        p = (m.get("pct") or {}).get(str(m["windows"][0])) if m["status"] != "missing" else None
        if p is None:
            continue
        fresh += 1
        if p >= entry["componentPct"]:
            cnt += 1
            hot.append(sid)
    partial = fresh < entry["minFreshComponents"]
    r = _res(entry, entry["id"], "vol_breadth", status="partial" if partial else "ok",
             measures={"status": "ok", "count": cnt, "nFresh": fresh, "nComponents": len(entry["components"]), "hot": hot,
                       "pctWindow": ctx.cfg["windows"]["daily"][0], "componentPct": entry["componentPct"]},
             obsDate=date, inputs=list(entry["components"]), flags=stale_flags + [f"MISSING:{x}" for x in missing] + (["PARTIAL_COMPONENTS:vol_breadth"] if partial else []),
             triggersEvaluated=1)
    if not partial and cnt >= entry["minCount"]:
        r["fired"].append({"trigger": "extreme", "variant": "breadth", "side": "high", "strength": {"count": cnt, "nFresh": fresh, "hot": hot}})
    return [r]


def k_level_state(ctx, date, entry, pts):
    s = ctx.series(entry["series"], date)
    if s is None or not s.dates:
        return [_missing(entry, entry["id"], "level_state", [entry["series"]], ctx, date, "series not available")]
    hold = ctx.cfg["triggers"]["regime"]["hold"]
    labs = T.regime_labels(s.values[-(hold + 1):], entry["cuts"], entry["labels"])
    r = _res(entry, entry["id"], "level_state", measures={"status": "ok", "value": s.values[-1], "state": labs[-1], "cuts": entry["cuts"], "asOfDate": s.dates[-1]},
             obsDate=obs_date(s), inputs=[entry["series"]], flags=ctx.flag_strings([entry["series"]], date), triggersEvaluated=1)
    r["fired"] += T.regime_change(labs, ctx.cfg, {"cuts": entry["cuts"], "value": s.values[-1]})
    return [r]


def k_divergence(ctx, date, entry, pts):
    out = []
    for pr in entry["pairs"]:
        a, b = ctx.series(pr["a"], date), ctx.series(pr["b"], date)
        rid = f"{entry['id']}:{pr['a']}~{pr['b']}"
        ins = [pr["a"], pr["b"]]
        if a is None or b is None or not a.dates or not b.dates:
            out.append(_missing(entry, rid, "divergence", ins, ctx, date, "series not available"))
            continue
        fired, info = T.divergence(a.dates, a.values, b.dates, b.values, pr.get("relation", 1), a.change_kind, b.change_kind, ctx.cfg)
        r = _res(entry, rid, "divergence", status="ok" if "corr" in info else "building", measures=dict(info, status="ok", asOfDate=a.dates[-1]),
                 obsDate=min(obs_date(a), obs_date(b)), inputs=ins, flags=ctx.flag_strings(ins, date), triggersEvaluated=1)
        r["fired"] += fired
        out.append(r)
    return out


def k_input_staleness(ctx, date, entry, pts):
    out = []
    for sid in sorted(ctx.inp.series):
        s = ctx.series(sid, date)
        fl = ctx.flags(sid, date)
        r = _res(entry, f"{entry['id']}:{sid}", "input_staleness", measures={"status": "ok", "lastObservation": s.dates[-1] if s and s.dates else None},
                 obsDate=date, inputs=[sid], flags=[], triggersEvaluated=1)
        st = [f for f in fl if f["code"] == "STALE"]
        if st:
            r["flags"] = flag_strings(sid, fl)
            r["fired"].append({"trigger": "stale", "side": "stale", "strength": {"detail": st[0]["detail"]}})
        out.append(r)
    return out


# ------------------------------------------------------------------------------------------------------ point items
def k_gamma(ctx, date, entry, pts):
    if not pts:
        return []
    g = ctx.inp.points.get("gamma")
    if not g:
        return [_res(entry, entry["id"], "gamma", status="missing", flags=["MISSING:gamma"], notes=["no gamma rows in the state document (assets.gamma)"])]
    rows = {r["sym"]: r for r in g["rows"]}
    out = []
    for sym in entry["symbols"]:
        row = rows.get(sym)
        rid = f"{entry['id']}:{sym}"
        if not row:
            out.append(_res(entry, rid, "gamma", status="missing", flags=[f"MISSING:gamma.{sym}"]))
            continue
        dist = row.get("flipDistPct")
        r = _res(entry, rid, "gamma", measures={"status": "ok", "flipDistPct": dist, "regime": row.get("regime"), "netGex": row.get("netGex"),
                                               "sign": None if dist is None else (1 if dist > 0 else -1), "note": "sign only: no Cboe history yet (DATA_AGENT 1.2)",
                                               "chainStamp": row.get("asOf")},
                 obsDate=g["stamp"], inputs=["gamma"], triggersEvaluated=2, flags=[])
        if dist is not None and abs(dist) < entry["nearFlipPct"]:
            r["fired"].append({"trigger": "regime", "side": "near_flip", "variant": "membership", "strength": {"flipDistPct": dist, "limit": entry["nearFlipPct"]}})
        prev = ctx.prior_points.get(rid, {}).get("sign")
        if dist is not None and prev not in (None, 0) and (1 if dist > 0 else -1) != prev:
            r["fired"].append({"trigger": "flip", "side": "to_positive" if dist > 0 else "to_negative", "variant": "vs_prior_run",
                               "strength": {"flipDistPct": dist, "priorSign": prev}})
        out.append(r)
    return out


def k_gamma_breadth(ctx, date, entry, pts):
    if not pts:
        return []
    g = ctx.inp.points.get("gamma")
    if not g:
        return [_res(entry, entry["id"], "gamma_breadth", status="missing", flags=["MISSING:gamma"])]
    rows = {r["sym"]: r for r in g["rows"]}
    have = [s for s in entry["symbols"] if s in rows]
    n_break = sum(1 for s in have if rows[s].get("regime") == "BREAKOUT")
    r = _res(entry, entry["id"], "gamma_breadth", status="ok" if len(have) == len(entry["symbols"]) else "partial",
             measures={"status": "ok", "breakout": n_break, "of": len(have), "pin": len(have) - n_break}, obsDate=g["stamp"], inputs=["gamma"],
             triggersEvaluated=1, flags=[] if len(have) == len(entry["symbols"]) else ["PARTIAL_COMPONENTS:gamma"])
    if n_break >= entry["minBreakout"]:
        r["fired"].append({"trigger": "regime", "side": "broad_short_gamma", "variant": "membership", "strength": {"breakout": n_break, "of": len(have)}})
    return [r]


def k_feed_health(ctx, date, entry, pts):
    if not pts:
        return []
    out = []
    h = ctx.inp.points.get("health")
    if h:
        for row in h["rows"]:
            r = _res(entry, f"{entry['id']}:state:{row.get('key')}", "feed_health", measures={"status": "ok", "ageDays": row.get("ageDays"), "stale": row.get("stale"), "asOf": row.get("asOf")},
                     obsDate=h["stamp"], inputs=["state.health"], triggersEvaluated=1)
            if row.get("stale"):
                r["flags"] = [f"STALE:state.{row.get('key')}"]
                r["fired"].append({"trigger": "stale", "variant": "state_health", "side": "stale", "strength": {"ageDays": row.get("ageDays"), "asOf": row.get("asOf")}})
            out.append(r)
    else:
        out.append(_res(entry, f"{entry['id']}:state", "feed_health", status="missing", flags=["MISSING:state.health"]))
    dh = ctx.inp.points.get("data_health")
    if dh:
        for row in dh["bad"]:
            r = _res(entry, f"{entry['id']}:datahealth:{row['id']}", "feed_health", measures={"status": "ok", "state": row["state"], "ageDays": row["ageDays"]},
                     obsDate=dh["stamp"], inputs=["api_data_health"], triggersEvaluated=1, flags=[f"STALE:datahealth.{row['id']}"])
            r["fired"].append({"trigger": "stale", "variant": "data_health", "side": row["state"], "strength": {"ageDays": row["ageDays"]}})
            out.append(r)
    return out


def k_desk_quality(ctx, date, entry, pts):
    if not pts:
        return []
    q = ctx.inp.points.get("desk_quality")
    if not q:
        return [_res(entry, entry["id"], "desk_quality", status="missing", flags=["MISSING:desk_pack"], notes=["no /api/desk-pack document (pass --desk-pack-url or --desk-pack-file)"])]
    r = _res(entry, entry["id"], "desk_quality", measures={"status": "ok", "usableShare": q["usableShare"], "decision": q["decision"], "reasons": q["reasons"], "builtAt": q["builtAt"]},
             obsDate=q["stamp"], inputs=["desk_pack"], triggersEvaluated=1)
    us = q["usableShare"]
    if (us is not None and us < entry["minUsableShare"]) or (q["decision"] not in (None, "run")):
        r["flags"] = ["STALE:desk_pack"]
        r["fired"].append({"trigger": "stale", "variant": "usable_share", "side": "low_quality", "strength": {"usableShare": us, "decision": q["decision"]}})
    return [r]


KINDS = {"series": k_series, "ratio": k_ratio, "drdt": k_drdt, "ivrv": k_ivrv, "cot": k_cot, "cot_release": k_cot_release,
         "hl_line": k_hl_line, "curve_class": k_curve_class, "vol_breadth": k_vol_breadth, "level_state": k_level_state,
         "divergence_pairs": k_divergence, "input_staleness": k_input_staleness, "gamma": k_gamma, "gamma_breadth": k_gamma_breadth,
         "feed_health": k_feed_health, "desk_quality": k_desk_quality}
