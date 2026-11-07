#!/usr/bin/env python3
"""Score forge/FOOTPRINT_ABSORPTION_PREREG.md. Seed 20261107. Reads local raw files only; never calls Databento's paid API.

    python scripts/footprint-absorption/score.py bars     # raw trades -> 5-minute bars with flow at the extremes (no outcome read)
    python scripts/footprint-absorption/score.py count    # events and controls, pooled SDs, no split by event or control
    python scripts/footprint-absorption/score.py score    # the scored run, only after the count-first amendment is committed
"""
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 20261107
B = 2000
BLOCK = 20
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/footprint-absorption"
BASE = Path(os.environ.get("ORDERFLOW_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "orderflow"))
CACHE = Path(os.environ.get("ABSORB_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "absorption_5m"))
# root: raw folder, first day, last day, session start and bar count (New York), tick, dollars per point, scored?
SPEC = {"6E": ("trades/6E", "2023-04-03", "2026-08-21", 180, 156, .00005, 125000, True),
        "6J": ("trades/6J", "2023-08-01", "2026-08-21", 180, 156, .0000005, 12500000, True),
        "NQ": ("trades_rth/NQ", "2026-01-01", "2026-08-21", 570, 78, .25, 20, False)}
COMMISSION = 4.0
HORIZONS = (5, 15, 30, 60)
SCORED_H = (15, 60)
SIGW = 60
HIST, MINHIST = 60, 20
SPACING = 12
FIELDS = "o h l c buy sell tbuy tsell sell_low buy_high".split()


def session_arrays(t, start, nb):
    """One New York day's trades -> per-bar arrays. Returns (dict, 'ok') or (None, reason)."""
    loc = t.ts_event.dt.tz_convert("America/New_York")
    m = (loc.dt.hour * 60 + loc.dt.minute - start).to_numpy()
    keep = (m >= 0) & (m < nb * 5)
    t = t[keep]
    m = m[keep]
    if t.empty:
        return None, "empty"
    if t.instrument_id.nunique() > 1:
        return None, "roll"
    b = m // 5
    px, sz, sd = t.price.to_numpy(float), t["size"].to_numpy(float), t.side.to_numpy()
    tick = np.sign(np.diff(px, prepend=px[0]))
    tick = pd.Series(np.where(tick == 0, np.nan, tick)).ffill().fillna(0).to_numpy()
    a = {f: np.full(nb, np.nan) for f in "ohlc"}
    g = pd.Series(px).groupby(b)
    idx = g.first().index.to_numpy()
    a["o"][idx], a["h"][idx], a["l"][idx], a["c"][idx] = g.first().to_numpy(), g.max().to_numpy(), g.min().to_numpy(), g.last().to_numpy()
    if np.isfinite(a["c"]).sum() < .95 * nb:
        return None, "thin"
    isb, isa = sd == "B", sd == "A"
    a["buy"], a["sell"] = np.bincount(b, sz * isb, nb), np.bincount(b, sz * isa, nb)
    a["tbuy"], a["tsell"] = np.bincount(b, sz * (tick > 0), nb), np.bincount(b, sz * (tick < 0), nb)
    lo, hi = a["l"][b], a["h"][b]
    third = (hi - lo) / 3
    a["sell_low"] = np.bincount(b, sz * (isa & (px <= lo + third)), nb)
    a["buy_high"] = np.bincount(b, sz * (isb & (px >= hi - third)), nb)
    return a, "ok"


def bars():
    import databento as db
    CACHE.mkdir(parents=True, exist_ok=True)
    report = {}
    for root, (folder, a, z, start, nb, *_rest) in SPEC.items():
        base = BASE / "raw" / "GLBX" / folder
        counts = dict(ok=0, empty=0, roll=0, thin=0)
        days = {}
        for f in sorted(base.glob("*.dbn.zst")):
            d = f.name[:10]
            if d < a or d > z or pd.Timestamp(d).dayofweek >= 5:
                continue
            t = db.DBNStore.from_file(str(f)).to_df(pretty_ts=True, price_type="float", map_symbols=False)
            if "ts_event" not in t.columns:
                t = t.reset_index()
            s, why = session_arrays(t.sort_values("ts_event", kind="stable")[["ts_event", "instrument_id", "price", "size", "side"]], start, nb)
            counts[why] += 1
            if s:
                days[d] = s
        ds = sorted(days)
        np.savez_compressed(CACHE / f"{root}.npz", days=np.array(ds), **{k: np.stack([days[d][k] for d in ds]) for k in FIELDS})
        report[root] = counts
        print(root, counts, flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bars_report.json").write_text(json.dumps(report, indent=1))


def load(root):
    z = np.load(CACHE / f"{root}.npz", allow_pickle=False)
    return {k: z[k] for k in z.files}


def trailing(x, k):
    """The sessions that may inform session k: up to HIST strictly before it, or None if under MINHIST."""
    return x[max(0, k - HIST):k] if k >= MINHIST else None


def prepare(d):
    """Everything known at each bar's close."""
    c = pd.DataFrame(d["c"]).ffill(axis=1)
    first = pd.Series(d["o"][np.arange(len(d["o"])), np.argmax(np.isfinite(d["o"]), axis=1)])
    close = c.to_numpy()
    close = np.where(np.isfinite(close), close, first.to_numpy()[:, None])
    prev = np.c_[first.to_numpy(), close[:, :-1]]
    r = np.log(close / prev)
    sig = pd.Series(r.ravel()).rolling(SIGW).std(ddof=0).to_numpy().reshape(r.shape)
    tot = d["buy"] + d["sell"]
    with np.errstate(divide="ignore", invalid="ignore"):
        D = (d["buy"] - d["sell"]) / tot
        T = (d["tbuy"] - d["tsell"]) / (d["tbuy"] + d["tsell"])
        sl, bh = d["sell_low"] / tot, d["buy_high"] / tot
    return dict(close=close, sig=sig, D=D, T=T, sl=sl, bh=bh, rng=d["h"] - d["l"], vol=tot)


def events_for(root, d, p):
    """Rows for every event and control bar. Thresholds use earlier sessions only."""
    *_x, start, nb, tick, pv, _sc = SPEC[root]
    rows = []
    n = len(d["days"])
    for k in range(n):
        Dh, Sh, Bh, Rh, Vh = (trailing(p[x], k) for x in ("D", "sl", "bh", "rng", "vol"))
        if Dh is None:
            continue
        q = lambda a, v: np.nanquantile(a, v)
        d10, d40, d60, d90 = q(Dh, .1), q(Dh, .4), q(Dh, .6), q(Dh, .9)
        s40, s60, s90 = q(Sh, .4), q(Sh, .6), q(Sh, .9)
        b40, b60, b90 = q(Bh, .4), q(Bh, .6), q(Bh, .9)
        r50 = q(Rh, .5)
        with np.errstate(all="ignore"):
            v50 = np.nanmedian(Vh, axis=0)
        o, h, l, c = d["o"][k], d["h"][k], d["l"][k], d["c"][k]
        D, sl, bh, rng, vol = p["D"][k], p["sl"][k], p["bh"][k], p["rng"][k], p["vol"][k]
        for i in range(nb - 1):
            if not (np.isfinite(o[i]) and np.isfinite(D[i])) or not (rng[i] >= r50 and vol[i] >= v50[i]):
                continue
            up, down = c[i] > o[i], c[i] < o[i]
            if not (up or down):
                continue
            side = 1 if up else -1
            top_half = c[i] >= l[i] + rng[i] / 2
            bot_half = c[i] <= l[i] + rng[i] / 2
            lab = {}
            if up:
                lab["A"] = "event" if D[i] <= d10 else "control" if d40 <= D[i] <= d60 else None
                if top_half:
                    lab["B"] = "event" if sl[i] >= s90 else "control" if s40 <= sl[i] <= s60 else None
            else:
                lab["A"] = "event" if D[i] >= d90 else "control" if d40 <= D[i] <= d60 else None
                if bot_half:
                    lab["B"] = "event" if bh[i] >= b90 else "control" if b40 <= bh[i] <= b60 else None
            for ev, what in lab.items():
                if what is None:
                    continue
                m = outcome(d, p, k, i, side, tick, pv, nb)
                if m:
                    rows.append(dict(root=root, day=str(d["days"][k]), k=k, i=i, hour=(start + i * 5) // 60, side=side, ev=ev, what=what, **m))
    return rows


def outcome(d, p, k, i, side, tick, pv, nb):
    """Next-bar entry, standardised returns and the bracket trade. None if there is no next bar with trades or no sigma."""
    j = i + 1
    while j < nb and not np.isfinite(d["o"][k][j]):
        j += 1
    sig = p["sig"][k][i]
    if j >= nb or not sig > 0:
        return None
    entry = d["o"][k][j]
    out = {}
    for h in HORIZONS:
        n = h // 5
        e = j + n - 1
        out[f"O{h}"] = side * math.log(p["close"][k][e] / entry) / (sig * math.sqrt(n)) if e < nb else float("nan")
    stop = d["l"][k][i] - 2 * tick if side > 0 else d["h"][k][i] + 2 * tick
    dist = (entry - stop) * side
    out.update(R=float("nan"), Rg=float("nan"), why="", dist=dist)
    if dist < 4 * tick:
        out["why"] = "tight"
        return out
    target = entry + side * 2 * dist
    r = trade(d["h"][k], d["l"][k], p["close"][k], j, nb, side, entry, stop, target)
    gross, slip, why = r
    out["Rg"] = gross / dist
    out["R"] = (gross - slip * tick - COMMISSION / pv) / dist
    out["why"] = why
    return out


def trade(high, low, close, j, nb, side, entry, stop, target):
    """Stop first when both are inside one bar. Returns (gross points, ticks of slippage, reason)."""
    for b in range(j, nb):
        if not np.isfinite(low[b]):
            continue
        if (side > 0 and low[b] <= stop) or (side < 0 and high[b] >= stop):
            return (stop - entry) * side, 2, "stop"
        if (side > 0 and high[b] >= target) or (side < 0 and low[b] <= target):
            return (target - entry) * side, 1, "target"
    return (close[nb - 1] - entry) * side, 2, "close"


def declutter(df):
    """Kept event = no earlier kept event of the same instrument, event type and side inside SPACING bars. Controls stay."""
    ev = df[df.what == "event"].sort_values(["root", "ev", "side", "k", "i"])
    keep, last = [], {}
    for idx, r in zip(ev.index, ev.itertuples()):
        key = (r.root, r.ev, r.side)
        pos = (r.k, r.i)
        if key in last and last[key][0] == r.k and r.i - last[key][1] <= SPACING:
            continue
        last[key] = pos
        keep.append(idx)
    return pd.concat([df.loc[keep], df[df.what == "control"]]).reset_index(drop=True)


def contrasts(df, col):
    """Event value minus the mean control in the same instrument, side and hour. Events without a control are dropped and counted."""
    c = df[df.what == "control"].dropna(subset=[col]).groupby(["root", "side", "hour"])[col].mean().rename("cm")
    e = df[df.what == "event"].dropna(subset=[col]).join(c, on=["root", "side", "hour"])
    return e.assign(contrast=e[col] - e.cm).dropna(subset=["contrast"]), int(e.cm.isna().sum())


def boot(x, days, rng, B_=B):
    x = np.asarray(x, float)
    u = sorted(set(days))
    if len(x) < 5 or len(u) < 25:
        return dict(n=len(x), est=float(x.mean()) if len(x) else None, lo=None, hi=None, p=None)
    pos = {d: i for i, d in enumerate(u)}
    idx = np.array([pos[d] for d in days])
    s, n = np.bincount(idx, x, len(u)), np.bincount(idx, minlength=len(u)).astype(float)
    nb = math.ceil(len(u) / BLOCK)
    st = np.empty(B_)
    for b in range(B_):
        a = rng.integers(0, len(u) - BLOCK + 1, nb)
        take = (a[:, None] + np.arange(BLOCK)).ravel()
        st[b] = s[take].sum() / max(1, n[take].sum())
    lo, hi = np.percentile(st, [2.5, 97.5])
    return dict(n=len(x), est=float(x.mean()), lo=float(lo), hi=float(hi), se=float(st.std()), p=float(max(2 * min((st <= 0).mean(), (st >= 0).mean()), 1 / B_)))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, top = [0.0] * len(ps), 0.0
    for r, i in enumerate(order):
        top = max(top, min(1.0, ps[i] * (len(ps) - r)))
        adj[i] = top
    return adj


def table(roots):
    rows = []
    for r in roots:
        d = load(r)
        rows += events_for(r, d, prepare(d))
    return declutter(pd.DataFrame(rows))


def mde(sd, n, m=None):
    return 3.48 * sd * math.sqrt(1 / n + (1 / m if m else 0)) if n else None


def count():
    df = table(["6E", "6J"])
    res = dict(counts=df.groupby(["root", "ev", "what"]).size().unstack(fill_value=0).reset_index().to_dict("records"))
    for h in SCORED_H:
        res[f"sd_O{h}"] = float(df[f"O{h}"].std())
    res["sd_R"] = float(df.R.std())
    for ev in "AB":
        s = df[df.ev == ev]
        ne, nc = int((s.what == "event").sum()), int((s.what == "control").sum())
        res[ev] = dict(events=ne, controls=nc, mde_O15=mde(res["sd_O15"], ne, nc), mde_O60=mde(res["sd_O60"], ne, nc), mde_R=mde(res["sd_R"], ne))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "count_first.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


def shuffle_p95(df, col, rng, B_=1000):
    d = df.dropna(subset=[col]).copy()
    groups = [g.index.to_numpy() for _, g in d.groupby(["root", "side", "hour"])]
    x = d[col].to_numpy()
    pos = {v: i for i, v in enumerate(d.index)}
    lab = (d.what == "event").to_numpy()
    grp = [np.array([pos[v] for v in g]) for g in groups]
    out = np.empty(B_)
    for b in range(B_):
        l = lab.copy()
        for g in grp:
            l[g] = rng.permutation(lab[g])
        cm = {}
        tot, n = 0.0, 0
        for g in grp:
            lg = l[g]
            if lg.any() and (~lg).any():
                xg = x[g]
                tot += (xg[lg] - xg[~lg].mean()).sum()
                n += int(lg.sum())
        out[b] = tot / max(1, n)
    return float(np.percentile(out, 95)), float(np.percentile(out, 5))


def stats_for(df, rng):
    res = {}
    for ev in "AB":
        s = df[df.ev == ev]
        for h in SCORED_H:
            e, dropped = contrasts(s, f"O{h}")
            c = boot(e.contrast, list(e.day), rng)
            mid = sorted(set(df.day))[len(set(df.day)) // 2]
            c.update(no_control=dropped, half1=float(e[e.day < mid].contrast.mean()), half2=float(e[e.day >= mid].contrast.mean()),
                     per_root={r: float(g.contrast.mean()) for r, g in e.groupby("root")}, event_mean=float(e[f"O{h}"].mean()))
            res[f"{ev}{h}"] = c
        ev_t = s[(s.what == "event")].dropna(subset=["R"])
        c = boot(ev_t.R, list(ev_t.day), rng)
        mid = sorted(set(df.day))[len(set(df.day)) // 2]
        c.update(half1=float(ev_t[ev_t.day < mid].R.mean()), half2=float(ev_t[ev_t.day >= mid].R.mean()), per_root={r: float(g.R.mean()) for r, g in ev_t.groupby("root")})
        res[f"{ev}R"] = c
    return res


def parts(df, rng):
    out = {}
    for ev in "AB":
        s = df[df.ev == ev]
        e = s[s.what == "event"].dropna(subset=["R"])
        c = s[s.what == "control"].dropna(subset=["R"])
        res = e[e.why.isin(["stop", "target"])]
        hit = (res.why == "target").astype(float).to_numpy() - (1 / 3)      # target 2R, stop 1R: a random walk reaches the target a third of the time
        out[ev] = dict(gross=boot(e.Rg, list(e.day), rng), net=float(e.R.mean()), control_net=float(c.R.mean()), control_gross=float(c.Rg.mean()), n_control=len(c),
                       target_minus_rw=boot(hit, list(res.day), rng), exits=e.why.value_counts().to_dict(), tight=int((s[s.what == "event"].why == "tight").sum()),
                       by_side={str(k): dict(n=len(g), contrast15=float(contrasts(s[s.side == k], "O15")[0].contrast.mean()), R=float(g.R.mean())) for k, g in e.groupby("side")},
                       by_session={n: dict(n=int(m.sum()), R=float(e[m].R.mean())) for n, m in (("London hours", e.hour < 8), ("US hours", e.hour >= 8))},
                       desc={f"O{h}": float(contrasts(s, f"O{h}")[0].contrast.mean()) for h in (5, 30)})
    return out


def score():
    rng = np.random.default_rng(SEED)
    df = table(["6E", "6J"])
    cells = stats_for(df, rng)
    names = list(cells)
    adj = holm([cells[k]["p"] for k in names])
    for k, a in zip(names, adj):
        cells[k]["holm_p"] = a
    pr = np.random.default_rng(SEED + 1)
    held = {}
    for ev in "AB":
        s = df[df.ev == ev]
        for h in SCORED_H:
            c = cells[f"{ev}{h}"]
            p95, p05 = shuffle_p95(s, f"O{h}", pr)
            c["shuffle_p95"], c["shuffle_p05"] = p95, p05
            c["same_sign"] = (c["half1"] > 0) == (c["half2"] > 0) == (c["est"] > 0) and all((v > 0) == (c["est"] > 0) for v in c["per_root"].values())
            pos = c["est"] >= .15 and c["lo"] > 0 and c["holm_p"] < .05 and c["same_sign"] and c["est"] > p95
            mir = c["est"] <= -.15 and c["hi"] < 0 and c["holm_p"] < .05 and c["same_sign"] and c["est"] < p05
            held[f"{ev}{h}"] = "pass" if pos else "mirror" if mir else "no"
        c = cells[f"{ev}R"]
        c["same_sign"] = (c["half1"] > 0) == (c["half2"] > 0) == (c["est"] > 0) and all((v > 0) == (c["est"] > 0) for v in c["per_root"].values())
        held[f"{ev}R"] = "pass" if c["est"] >= .15 and c["lo"] > 0 and c["holm_p"] < .05 and c["same_sign"] else "no"
    ok = any(held[f"{ev}R"] == "pass" and (held[f"{ev}15"] == "pass" or held[f"{ev}60"] == "pass") for ev in "AB")
    any_c = any(v in ("pass", "mirror") for k, v in held.items())
    # NQ, descriptive
    nq = {}
    try:
        d = load("NQ")
        p = prepare(d)
        m = np.isfinite(p["D"]) & np.isfinite(p["T"])
        nq["corr_tick_vs_true_D"] = float(np.corrcoef(p["D"][m], p["T"][m])[0, 1])
        nq["sessions"] = len(d["days"])
        nq["first"], nq["last"] = str(d["days"][0]), str(d["days"][-1])
        dn = pd.DataFrame(events_for("NQ", d, p))
        if len(dn):
            dn = declutter(dn)
            for ev in "AB":
                s = dn[dn.ev == ev]
                nq[ev] = dict(events=int((s.what == "event").sum()), controls=int((s.what == "control").sum()),
                              contrast15=float(contrasts(s, "O15")[0].contrast.mean()) if (s.what == "event").any() else None,
                              net_R=float(s[s.what == "event"].R.mean()) if (s.what == "event").any() else None)
    except FileNotFoundError:
        nq["missing"] = True
    out = dict(id="footprint-absorption", ranAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), seed=SEED, B=B, prereg="forge/FOOTPRINT_ABSORPTION_PREREG.md", branch="main",
               held=held, gate_validated=ok, any_cell=any_c, cells=cells, parts=parts(df, rng), nq=nq)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "scored.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps({k: out[k] for k in ("held", "gate_validated", "any_cell", "cells", "parts", "nq")}, default=float))


if __name__ == "__main__":
    {"bars": bars, "count": count, "score": score}[sys.argv[1]]()
