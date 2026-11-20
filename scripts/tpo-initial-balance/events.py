"""Build the per-session event table. With outcomes=False (the count pass) nothing is computed from an event session's prices after its
event: only the setup counts, the features known at t, and the placebo (other-session) outcomes that the MDEs need."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

import tpo_ib as T


def build(s: T.Sessions, outcomes: bool, seed=T.SEED, start=T.START, end=T.END, plant=None):
    rng = np.random.default_rng(seed)
    tick, cost = T.TICK[s.sym], T.COST[s.sym]
    delta = T.bvc_delta(s)
    rows = []
    for i, day in enumerate(s.days):
        if day < start or day > end or not np.isfinite(s.sigma1[i]):
            continue
        ev = T.find_event(s, i)
        r = dict(i=i, day=day, kind=ev["kind"] if ev else "none")
        if not ev:
            rows.append(r)
            continue
        pl = T.placebo_sessions(rng, i)
        if pl is None:
            r["kind"] = "none"; rows.append(r); continue
        e = ev["pc"] + 1
        sign = ev["dir"] if ev["kind"] == "acc" else -ev["dir"]
        p = ev["p"]
        r.update(dir=ev["dir"], sign=sign, p=p, e=e, ibw=ev["ibh"] - ev["ibl"], sigma1=s.sigma1[i], h=T.N_MIN - e)
        # features known at t (A1)
        if ev["kind"] == "acc":
            a, b = (p - 1) * T.PER, p * T.PER + T.PER
            r["x_flow"] = T.flow_z(delta, s.V, i, a, b) * ev["dir"]
            o, hh, ll, cc = T.period_ohlc(s, i, p)
            r["x_candle"] = T.clv(o, hh, ll, cc, ev["dir"])
        else:
            a, b = p * T.PER, p * T.PER + T.PER
            r["x_flow"] = T.flow_z(delta, s.V, i, a, b) * ev["dir"]
            o, hh, ll, cc = T.period_ohlc(s, i, p)
            r["x_candle"] = T.clv(o, hh, ll, cc, -ev["dir"])
        a0 = p * T.PER
        prevv = [s.V[j, a0:a0 + T.PER].sum() for j in range(max(0, i - 20), i)]
        r["vol_ratio"] = s.V[i, a0:a0 + T.PER].sum() / np.median(prevv) if prevv and np.median(prevv) > 0 else np.nan
        # placebo outcomes (other sessions: allowed in the count pass)
        ypl = [T.outcome_y(s, j, e, sign) for j in pl]
        r["y_pl"] = float(np.mean(ypl))
        r["y_pl_each"] = ypl
        # the registered trade and its placebo twins. The stop distance comes from prices at or before t, so it is known at t.
        entry_known = s.O[i, e] if outcomes else None
        if outcomes:
            r["y"] = T.outcome_y(s, i, e, sign)
            r["d"] = r["y"] - r["y_pl"]
            tr = T.trade_for_event(s, i, ev, tick, cost)
            if tr:
                r.update(R=tr["R"], gR=tr["gR"], exit=tr["exit"], dist=tr["dist"])
                pr = [T.placebo_trade(s, j, e, tr["side"], tr["dist"], tr["tdist"], cost) for j in pl]
                r["R_pl"] = float(np.mean([x[0] for x in pr])); r["gR_pl"] = float(np.mean([x[1] for x in pr]))
                r["dR"] = r["R"] - r["R_pl"]
            # component (b): reach one more IB width beyond the broken edge (follow) / the opposite IB edge (fade) before the close
            if ev["kind"] == "acc":
                lvl = ev["ibh"] + r["ibw"] if ev["dir"] > 0 else ev["ibl"] - r["ibw"]
            else:
                lvl = ev["ibl"] if ev["dir"] > 0 else ev["ibh"]
            dist_lvl = sign * (lvl - s.O[i, e])
            r["reach"] = _reach(s, i, e, sign, dist_lvl)
            r["reach_pl"] = float(np.mean([_reach(s, j, e, sign, dist_lvl) for j in pl]))
        else:
            # count pass: the stop distance needs O[e] of the event session. Use the event period's close instead (known at t) to size
            # the placebo trades for the MDE; the real run uses O[e]. Strategy-cell SD comes from these placebo trades only.
            cpx = s.C[i, ev["pc"]]
            fake = dict(ev)
            side = sign
            if ev["kind"] == "acc":
                stop = ev["ibh"] - tick if side > 0 else ev["ibl"] + tick
                tdist = None
            else:
                stop = ev["ext"] + tick if ev["dir"] > 0 else ev["ext"] - tick
                tgt = ev["ibl"] if side < 0 else ev["ibh"]
                tdist = side * (tgt - cpx)
            dist = side * (cpx - stop)
            if dist >= 4 * tick and (tdist is None or tdist > 0):
                pr = [T.placebo_trade(s, j, e, side, dist, tdist, cost) for j in pl]
                r["R_pl_each"] = [x[0] for x in pr]
        rows.append(r)
    return pd.DataFrame(rows)


def _reach(s, i, e, sign, dist):
    if not np.isfinite(dist) or dist <= 0:
        return np.nan
    entry = s.O[i, e]
    if sign > 0:
        return float(s.H[i, e:].max() >= entry + dist)
    return float(s.L[i, e:].min() <= entry - dist)
