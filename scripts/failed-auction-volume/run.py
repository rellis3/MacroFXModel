#!/usr/bin/env python3
"""failed-auction-volume, per forge/FAILED_AUCTION_VOLUME_PREREG.md. Seed 20261022.

    python scripts/failed-auction-volume/run.py count     # n per instrument and V group, pooled SD of R (V label not used). Nothing else is printed.
    python scripts/failed-auction-volume/run.py score     # the scored run, only after the PRE-RESULTS amendment is committed

Input: analysis/output/nt8/continuous/<ROOT>_1m_unadj.parquet (git-ignored, on the laptop). Output: analysis/output/failed-auction-volume/.
Sessions after 2026-08-21 are never read into a setup (lockbox).
"""
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
IN = ROOT / "analysis/output/nt8/continuous"
OUT = ROOT / "analysis/output/failed-auction-volume"
SEED = 20261022
B = 2000
START, END = "2019-01-02", "2026-08-21"
SPLIT = "2022-12-31"
# open and close in New York minutes; tick; dollars per point
SPEC = {"NQ": (570, 960, .25, 20), "ES": (570, 960, .25, 50), "YM": (570, 960, 1.0, 5), "RTY": (570, 960, .1, 50),
        "GC": (500, 810, .1, 100), "CL": (540, 870, .01, 1000)}
COMMISSION = 4.0
# 1 if a bar's stamp is the END of its minute (the 09:30 minute is stamped 09:31), set from the volume spike at the open. See the amendment.
STAMP_OFFSET_MIN = int(json.loads((OUT / "stamp.json").read_text())["offset"]) if (OUT / "stamp.json").exists() else 0


def sessions(root):
    o, c, tick, pv = SPEC[root]
    d = pd.read_parquet(IN / f"{root}_1m_unadj.parquet")
    ny = d.timestamp.dt.tz_convert("America/New_York") - pd.Timedelta(minutes=STAMP_OFFSET_MIN)
    m = ny.dt.hour * 60 + ny.dt.minute
    keep = (m >= o) & (m < c) & (ny.dt.dayofweek < 5)
    d = d[keep].assign(day=ny[keep].dt.strftime("%Y-%m-%d"), i=(m[keep] - o).astype(int))
    d = d[d.day <= END]
    n = c - o
    out = []
    for day, g in d.groupby("day", sort=True):
        if len(g) < .8 * n:                                       # half days and thin sessions dropped, as registered
            continue
        a = np.full((n, 5), np.nan)
        idx = g.i.to_numpy()
        a[idx, 0], a[idx, 1], a[idx, 2], a[idx, 3], a[idx, 4] = g.open, g.high, g.low, g.close, g.volume
        px = pd.Series(a[:, 3]).ffill().to_numpy()                # a minute with no trade: price holds, no high, low or volume
        out.append(dict(day=day, o=a[:, 0], h=a[:, 1], l=a[:, 2], c=px, v=np.nan_to_num(a[:, 4]), contract=set(g.contract)))
    return out


def sigma30(ss, k):
    """SD of non-overlapping 30-minute log returns inside the previous 20 sessions (strictly before k)."""
    if k < 20:
        return None
    r = []
    for s in ss[k - 20:k]:
        p = s["c"][::30]
        p = p[~np.isnan(p)]
        r.extend(np.diff(np.log(p)))
    return float(np.std(r, ddof=1)) if len(r) > 10 else None


def machine(s, h_b, l_b, end_b, side, tick, probe_side):
    """From the bar after the balance: the first probe, its void level, the reclaim. side +1 = long entry.
    probe_side -1 probes below L, +1 probes above H. Returns (start, reclaim, extreme) or None."""
    n = len(s["c"])
    width = h_b - l_b
    for i in range(end_b + 1, n):
        if probe_side < 0 and not np.isnan(s["l"][i]) and s["l"][i] < l_b - tick:
            start = i
            break
        if probe_side > 0 and not np.isnan(s["h"][i]) and s["h"][i] > h_b + tick:
            start = i
            break
    else:
        return None
    ext = None
    for i in range(start, min(start + 16, n)):
        lo, hi, cl = s["l"][i], s["h"][i], s["c"][i]
        if np.isnan(lo):
            continue
        if probe_side < 0:
            if lo < l_b - .5 * width:                             # went too far: acceptance, void
                return None
            ext = lo if ext is None else min(ext, lo)
            if cl >= l_b:
                return start, i, ext
        else:
            if hi > h_b + .5 * width:
                return None
            ext = hi if ext is None else max(ext, hi)
            if cl <= h_b:
                return start, i, ext
    return None


def trade(s, entry_i, side, stop, target, tick, pv):
    """Enter at entry_i's open. Stop first when both are inside one minute. Net R after the registered costs."""
    n = len(s["c"])
    if entry_i >= n:
        return None
    k = entry_i
    while k < n and np.isnan(s["o"][k]):
        k += 1
    if k >= n:
        return None
    entry = s["o"][k]
    dist = (entry - stop) * side
    if dist < 4 * tick:                                           # costs dominate, skipped as registered (also catches an open through the stop)
        return None
    for i in range(k, n):
        lo, hi = s["l"][i], s["h"][i]
        if np.isnan(lo):
            continue
        if (side > 0 and lo <= stop) or (side < 0 and hi >= stop):
            ex, slip, why = stop, 2, "stop"
            break
        if (side > 0 and hi >= target) or (side < 0 and lo <= target):
            ex, slip, why = target, 1, "target"                   # entry slips 1 tick, a limit target does not
            break
    else:
        ex, slip, why = s["c"][n - 1], 2, "close"
    gross = (ex - entry) * side
    net = gross - slip * tick - COMMISSION / pv
    return dict(r=net / dist, r_gross=gross / dist, dist=dist, entry=entry, exit=ex, why=why, entry_i=k, d_target=(target - entry) * side)


def poc_of(s, a, b, tick):
    prof = {}
    for i in range(a, b + 1):
        lo, hi, v = s["l"][i], s["h"][i], s["v"][i]
        if np.isnan(lo) or v <= 0:
            continue
        ks = range(round(lo / tick), round(hi / tick) + 1)
        for k in ks:
            prof[k] = prof.get(k, 0) + v / len(ks)
    return max(prof, key=prof.get) * tick if prof else None


def vol_ratio(ss, k, start, rec, a, b):
    hist = np.array([x["v"] for x in ss[k - 20:k]])
    med = np.median(hist, axis=0)
    with np.errstate(divide="ignore", invalid="ignore"):
        rel = np.where(med > 0, ss[k]["v"] / med, np.nan)
    p, q = np.nanmean(rel[start:rec + 1]), np.nanmean(rel[a:b + 1])
    return float(p / q) if q and q > 0 else None


def setups_for(root, ss, rng=None):
    o, c, tick, pv = SPEC[root]
    rows, pass_counts = [], dict(sessions=0, impulse=0, balance=0, fired=0, traded=0, skipped_contract=0)
    for k, s in enumerate(ss):
        if s["day"] < START:
            continue
        sg = sigma30(ss, k)
        if sg is None:
            continue
        pass_counts["sessions"] += 1
        p = s["c"]
        n = len(p)
        t = None
        for i in range(30, n - 61):                               # close(t-30) must be inside the session; see the amendment
            if np.isnan(p[i]) or np.isnan(p[i - 30]):
                continue
            if abs(math.log(p[i] / p[i - 30])) >= 2.0 * sg:
                t = i
                break
        if t is None:
            continue
        pass_counts["impulse"] += 1
        dirn = 1 if p[t] > p[t - 30] else -1
        size = np.nanmax(s["h"][t - 29:t + 1]) - np.nanmin(s["l"][t - 29:t + 1])
        H, L = np.nanmax(s["h"][t + 1:t + 61]), np.nanmin(s["l"][t + 1:t + 61])
        if not (H - L <= .6 * size) or H <= L:
            continue
        pass_counts["balance"] += 1
        if len(s["contract"]) > 1:                                # the session straddles a roll switch
            pass_counts["skipped_contract"] += 1
            continue
        for kind, probe_side, side in (("main", -dirn, dirn), ("mirror", dirn, -dirn)):
            m = machine(s, H, L, t + 60, side, tick, probe_side)
            if m is None:
                continue
            start, rec, ext = m
            stop = ext - 2 * tick if side > 0 else ext + 2 * tick
            target = H if side > 0 else L
            tr = trade(s, rec + 1, side, stop, target, tick, pv)
            if tr is None:
                continue
            if kind == "main":
                pass_counts["fired"] += 1
                pass_counts["traded"] += 1
            V = vol_ratio(ss, k, start, rec, t + 1, t + 60)
            poc = poc_of(s, t + 1, t + 60, tick)
            trp = trade(s, rec + 1, side, stop, poc, tick, pv) if poc is not None and (poc - tr["entry"]) * side > 0 else None
            rows.append(dict(root=root, day=s["day"], year=s["day"][:4], kind=kind, side=side, t=t, start=start, rec=rec, V=V,
                             r=tr["r"], r_gross=tr["r_gross"], why=tr["why"], dist_ticks=tr["dist"] / tick, d_target=tr["d_target"], dist=tr["dist"],
                             r_poc=trp["r"] if trp else None, gamma=None))
    return rows, pass_counts


def placebo_for(root, ss, setups, rng):
    """Component check: the same machine at the same clock times with the same direction in a random other session, no impulse required."""
    _, _, tick, pv = SPEC[root]
    out = []
    n = len(ss)
    by = {s["day"]: i for i, s in enumerate(ss)}
    for r in setups:
        if r["kind"] != "main":
            continue
        k0 = by[r["day"]]
        for _ in range(3):
            lo, hi = max(20, k0 - 250), min(n - 1, k0 + 250)
            k = int(rng.integers(lo, hi + 1))
            if k == k0 or ss[k]["day"] < START or len(ss[k]["contract"]) > 1:
                continue
            s, t = ss[k], r["t"]
            H, L = np.nanmax(s["h"][t + 1:t + 61]), np.nanmin(s["l"][t + 1:t + 61])
            if not H > L:
                continue
            m = machine(s, H, L, t + 60, r["side"], tick, -r["side"])
            if m is None:
                continue
            start, rec, ext = m
            stop = ext - 2 * tick if r["side"] > 0 else ext + 2 * tick
            tr = trade(s, rec + 1, r["side"], stop, H if r["side"] > 0 else L, tick, pv)
            if tr:
                out.append(dict(root=root, day=s["day"], r=tr["r"], r_gross=tr["r_gross"]))
    return out


def blocks(days, rng, B_, size=20):
    """Index blocks of consecutive session dates, drawn with replacement. Clusters by date across instruments."""
    u = sorted(set(days))
    pos = {d: i for i, d in enumerate(u)}
    idx = np.array([pos[d] for d in days])
    nb = math.ceil(len(u) / size)
    by = [np.where(idx == i)[0] for i in range(len(u))]
    for _ in range(B_):
        st = rng.integers(0, max(1, len(u) - size + 1), nb)
        yield np.concatenate([by[j] for a in st for j in range(a, min(a + size, len(u)))] or [np.array([], int)])


def ci_mean(x, days, rng):
    x = np.asarray(x, float)
    d = [v for v in days]
    if len(x) < 2:
        return dict(n=len(x), est=None, lo=None, hi=None, p=None)
    st = np.array([x[i].mean() for i in blocks(d, rng, B) if len(i)])
    lo, hi = np.percentile(st, [2.5, 97.5])
    p = 2 * min((st <= 0).mean(), (st >= 0).mean())
    return dict(n=len(x), est=float(x.mean()), lo=float(lo), hi=float(hi), p=float(max(p, 1 / B)), se=float(st.std()))


def ci_diff(df, rng):
    a = (df.V <= 1).to_numpy()
    x = df.r.to_numpy()
    st = []
    for i in blocks(list(df.day), rng, B):
        m = a[i]
        if m.sum() and (~m).sum():
            st.append(x[i][m].mean() - x[i][~m].mean())
    st = np.array(st)
    lo, hi = np.percentile(st, [2.5, 97.5])
    return dict(n_low=int(a.sum()), n_high=int((~a).sum()), est=float(x[a].mean() - x[~a].mean()), lo=float(lo), hi=float(hi),
                p=float(max(2 * min((st <= 0).mean(), (st >= 0).mean()), 1 / B)), se=float(st.std()))


def load_all(rng):
    rows, passes, ss_all = [], {}, {}
    for root in SPEC:
        ss = sessions(root)
        r, c = setups_for(root, ss)
        rows += r
        passes[root] = c
        ss_all[root] = ss
        print(root, "sessions", len(ss), c, flush=True)
    return pd.DataFrame(rows), passes, ss_all


def mde(sd, n, deff=1.5, groups=1):
    return 3.08 * sd * math.sqrt(groups * deff / n) if n else None


def count():
    rng = np.random.default_rng(SEED)
    df, passes, _ = load_all(rng)
    OUT.mkdir(parents=True, exist_ok=True)
    m = df[df.kind == "main"]
    sd = float(m.r.std(ddof=1))
    g = m.assign(group=np.where(m.V.isna(), "noV", np.where(m.V <= 1, "low", "high"))).groupby(["root", "group"]).size().unstack(fill_value=0)
    n_low, n_high = int((m.V <= 1).sum()), int((m.V > 1).sum())
    res = dict(passes=passes, by_root_group=g.to_dict("index"), n_low=n_low, n_high=n_high, sd_R_pooled=sd,
               mde_S1=mde(sd, n_low), mde_S2=mde(sd, min(n_low, n_high), groups=2))
    (OUT / "count_first.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


def score():
    rng = np.random.default_rng(SEED)
    df, passes, ss_all = load_all(rng)
    OUT.mkdir(parents=True, exist_ok=True)
    main = df[(df.kind == "main") & df.V.notna()].reset_index(drop=True)
    low = main[main.V <= 1]
    S1 = ci_mean(low.r, list(low.day), rng)
    S2 = ci_diff(main, rng)
    holm_p = sorted([S1["p"], S2["p"]])
    holm = {"S1": min(1, S1["p"] * (2 if S1["p"] == holm_p[0] else 1)), "S2": min(1, S2["p"] * (2 if S2["p"] == holm_p[0] and S1["p"] != S2["p"] else 1))}
    h1, h2 = main[main.day <= SPLIT], main[main.day > SPLIT]
    halves = {}
    for nm, h in (("half1", h1), ("half2", h2)):
        l, g = h[h.V <= 1], h[h.V > 1]
        halves[nm] = dict(S1=float(l.r.mean()), S2=float(l.r.mean() - g.r.mean()), n_low=len(l), n_high=len(g))
    per = {}
    for root, g in main.groupby("root"):
        l, h = g[g.V <= 1], g[g.V > 1]
        per[root] = dict(n_low=len(l), n_high=len(h), S1=float(l.r.mean()) if len(l) else None, S2=float(l.r.mean() - h.r.mean()) if len(l) and len(h) else None,
                         all_r=float(g.r.mean()), all_gross=float(g.r_gross.mean()))
    # permutation placebo: V label shuffled within instrument-year
    perm = []
    pr = np.random.default_rng(SEED + 1)
    lab = (main.V <= 1).to_numpy()
    gid = (main.root + main.year).to_numpy()
    groups = [np.where(gid == g)[0] for g in sorted(set(gid))]
    x = main.r.to_numpy()
    for _ in range(1000):
        l2 = lab.copy()
        for g in groups:
            l2[g] = pr.permutation(lab[g])
        perm.append(x[l2].mean() - x[~l2].mean())
    p95 = float(np.percentile(perm, 95))

    # descriptive and components (Amendment A1)
    mir = df[df.kind == "mirror"]
    all_main = ci_mean(main.r, list(main.day), rng)
    pl = []
    for root, ss in ss_all.items():
        pl += placebo_for(root, ss, df[df.root == root].to_dict("records"), rng)
    pl = pd.DataFrame(pl)
    # target before stop against the random-walk rate stop / (stop + target), for trades that resolved at a bracket
    res = main[main.why.isin(["stop", "target"]) & (main.d_target > 0)]
    hit, expd = (res.why == "target").astype(float).to_numpy(), (res.dist / (res.dist + res.d_target)).to_numpy()
    comp_hit = ci_mean(hit - expd, list(res.day), rng)
    comp_gross = ci_mean(main.r_gross, list(main.day), rng)
    comp_impulse = dict(real_mean_r=float(main.r.mean()), placebo_n=len(pl), placebo_mean_r=float(pl.r.mean()) if len(pl) else None,
                        real_gross=float(main.r_gross.mean()), placebo_gross=float(pl.r_gross.mean()) if len(pl) else None)
    dp = ci_mean(main.r_poc.dropna(), list(main[main.r_poc.notna()].day), rng)
    d_mir = ci_mean(mir.r, list(mir.day), rng)
    why = main.why.value_counts().to_dict()

    gate = dict(
        S1_bar=S1["est"] >= .15, S2_bar=S2["est"] >= .20,
        S1_ci=S1["lo"] > 0 and holm["S1"] < .05, S2_ci=S2["lo"] > 0 and holm["S2"] < .05,
        same_sign=(halves["half1"]["S1"] > 0) == (halves["half2"]["S1"] > 0) and (halves["half1"]["S2"] > 0) == (halves["half2"]["S2"] > 0),
        s2_pos_instruments=sum(1 for v in per.values() if v["S2"] is not None and v["S2"] > 0), placebo_95=p95, above_placebo=S2["est"] > p95)
    gate["held"] = bool(gate["S1_bar"] and gate["S2_bar"] and gate["S1_ci"] and gate["S2_ci"] and gate["same_sign"] and gate["s2_pos_instruments"] >= 4 and gate["above_placebo"])
    out = dict(id="failed-auction-volume", ranAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), seed=SEED, B=B, prereg="forge/FAILED_AUCTION_VOLUME_PREREG.md",
               passes=passes, S1=S1, S2=S2, holm=holm, halves=halves, per_instrument=per, gate=gate, all_setups=all_main, mirror=d_mir, target_poc=dp, exits=why,
               components=dict(gross_before_costs=comp_gross, target_rate_minus_random_walk=comp_hit, no_impulse_placebo=comp_impulse),
               sd_R=float(main.r.std(ddof=1)), mde_S1=mde(float(main.r.std(ddof=1)), S1["n"]), mde_S2=mde(float(main.r.std(ddof=1)), min(S2["n_low"], S2["n_high"]), groups=2))
    (OUT / "scored.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    {"count": count, "score": score}[sys.argv[1]]()
