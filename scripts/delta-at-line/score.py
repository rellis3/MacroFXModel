#!/usr/bin/env python3
"""Score forge/DELTA_AT_LINE_PREREG.md. Seed 20261107. Reads local files only; never calls Databento's paid API.

    python scripts/delta-at-line/score.py bars       # raw trades and NQ ticks -> 1-minute flow bars (no outcome read)
    python scripts/delta-at-line/score.py features   # flow state at each frozen touch (no outcome read)
    python scripts/delta-at-line/score.py count      # signals and comparison touches, pooled SD of net K, no split by signal
    python scripts/delta-at-line/score.py score      # the scored run, only after the count-first amendment is committed
"""
import importlib.util
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

SEED = 20261107
B = 2000
BLOCK = 20
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/delta-at-line"
BASE = Path(os.environ.get("ORDERFLOW_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "orderflow"))
CACHE = Path(os.environ.get("DELTA_LINE_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "delta_line_1m"))
TICKS = Path(os.environ.get("ORDERFLOW_TICKS") or (Path(os.environ.get("TEMP", ".")) / "orderflow_ticks"))
EV = ROOT / "analysis/output/line_reaction/events_chosen"
LON = ZoneInfo("Europe/London")
# touch market: flow market, sign to apply to the touch side, window, scored?
MAP = {"EURUSD": ("6E", 1, "2023-04-03", "2026-08-21", True), "USDJPY": ("6J", -1, "2023-08-01", "2026-08-21", True), "NQ": ("NQ", 1, "2025-11-06", "2026-08-21", False)}
HIST, MINHIST = 60, 20
PREDICT = {"F1": 1, "F2": 1, "F3": -1, "F4": -1}     # +1 = more rejects, so fade; -1 = fewer, so follow
SWING_L = 2


def minute_bars(t):
    """Trades (ts_event, instrument_id, price, size, side) -> one row per traded minute."""
    t = t.sort_values("ts_event", kind="stable")
    m = t.ts_event.dt.floor("min")
    isb, isa = t.side == "B", t.side == "A"
    g = pd.DataFrame(dict(m=m, inst=t.instrument_id, p=t.price, b=t["size"] * isb, s=t["size"] * isa)).groupby("m")
    return pd.DataFrame(dict(buy=g.b.sum(), sell=g.s.sum(), high=g.p.max(), low=g.p.min(), close=g.p.last(), inst=g.inst.last())).reset_index()


def bars():
    import databento as db
    CACHE.mkdir(parents=True, exist_ok=True)
    for root in ("6E", "6J"):
        lead = (pd.Timestamp(next(v[2] for v in MAP.values() if v[0] == root)) - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
        out = []
        for f in sorted((BASE / "raw" / "GLBX" / "trades" / root).glob("*.dbn.zst")):
            if f.name[:10] < lead or f.name[:10] > "2026-08-22":
                continue
            t = db.DBNStore.from_file(str(f)).to_df(pretty_ts=True, price_type="float", map_symbols=False)
            if "ts_event" not in t.columns:
                t = t.reset_index()
            if len(t):
                out.append(minute_bars(t[["ts_event", "instrument_id", "price", "size", "side"]]))
        d = pd.concat(out).sort_values("m").drop_duplicates("m")
        d.to_parquet(CACHE / f"{root}.parquet", index=False)
        print(root, len(d), d.m.min(), d.m.max(), flush=True)
    out = []
    for f in sorted(TICKS.glob("NQ_*.parquet")):
        if f.stem[3:] > "2026-08-21":
            continue
        t = pd.read_parquet(f)
        unit = "s" if t.ts_ms.max() < 1e11 else "ms"
        ts = pd.to_datetime(t.ts_ms, unit=unit, utc=True)
        px = t.price.to_numpy(float)
        s = np.sign(np.diff(px, prepend=px[0]))
        s = pd.Series(np.where(s == 0, np.nan, s)).ffill().fillna(0).to_numpy()
        side = np.where(s > 0, "B", np.where(s < 0, "A", "N"))
        out.append(minute_bars(pd.DataFrame(dict(ts_event=ts, instrument_id=0, price=px, size=t.vol.to_numpy(float), side=side))))
    d = pd.concat(out).sort_values("m").drop_duplicates("m")
    d.to_parquet(CACHE / "NQ.parquet", index=False)
    print("NQ", len(d), d.m.min(), d.m.max(), flush=True)


def touch_utc(date, minute):
    y, mo, da = map(int, date.split("-"))
    return datetime(y, mo, da, tzinfo=LON).replace(hour=int(minute) // 60, minute=int(minute) % 60).astimezone(timezone.utc)


def blocks_back(ts, high, low, delta, t, o, n=24):
    """5-minute blocks counted back from the touch, oldest first, oriented so that 'high' is toward the line. None if under 100 of 120 minutes."""
    a = t - np.timedelta64(120, "m")
    i, j = np.searchsorted(ts, a), np.searchsorted(ts, t)
    if j - i < 100:
        return None
    H, L, D = np.full(n, np.nan), np.full(n, np.nan), np.zeros(n)
    idx = (((ts[i:j] - a) / np.timedelta64(1, "m")).astype(int)) // 5
    for b in range(n):
        m = idx == b
        if m.any():
            if o > 0:
                H[b], L[b] = high[i:j][m].max(), low[i:j][m].min()
            else:
                H[b], L[b] = -low[i:j][m].min(), -high[i:j][m].max()
            D[b] = o * delta[i:j][m].sum()
    return H, L, np.cumsum(D)


def swings(x, top=True, k=SWING_L):
    """Indices of confirmed fractal swings: k blocks each side, so the last k blocks cannot be swings."""
    out = []
    for j in range(k, len(x) - k):
        c = x[j]
        if not np.isfinite(c):
            continue
        near = np.r_[x[j - k:j], x[j + 1:j + k + 1]]
        if np.isnan(near).any():
            continue
        if (top and (c > near).all()) or (not top and (c < near).all()):
            out.append(j)
    return out


def divergences(H, L, C):
    """Regular: price beyond the latest swing high with cumulative delta below it. Hidden: higher swing low with lower cumulative delta. None where unmeasurable."""
    sh, sl = swings(H, True), swings(L, False)
    f2 = None
    if sh and np.isfinite(H[-2:]).any():
        s = sh[-1]
        f2 = bool(np.nanmax(H[-2:]) > H[s] and C[-1] < C[s])
    f3 = None
    if len(sl) >= 2:
        a, b = sl[-2], sl[-1]
        f3 = bool(L[b] > L[a] and C[b] < C[a])
    return f2, f3


def rolling_d(buy, sell, n):
    b, s = pd.Series(buy).rolling(n, min_periods=max(1, n * 2 // 3)).sum(), pd.Series(sell).rolling(n, min_periods=max(1, n * 2 // 3)).sum()
    with np.errstate(divide="ignore", invalid="ignore"):
        return ((b - s) / (b + s)).to_numpy()


def features_for(inst):
    root, flip, a, z, _sc = MAP[inst]
    d = pd.read_parquet(CACHE / f"{root}.parquet")
    d["m"] = pd.to_datetime(d.m, utc=True).dt.tz_localize(None)
    ts = d.m.to_numpy("datetime64[m]")
    buy, sell, hi, lo, cl, ci = (d[c].to_numpy(float) for c in ("buy", "sell", "high", "low", "close", "inst"))
    delta = buy - sell
    roll = {w: rolling_d(buy, sell, w) for w in (15, 30, 60)}
    day = d.m.dt.strftime("%Y-%m-%d").to_numpy()
    days = sorted(set(day))
    qdays = {x: i for i, x in enumerate(days)}
    pos = np.array([qdays[x] for x in day])
    E = pd.read_parquet(EV / f"{inst}.parquet", columns=["inst", "date", "side", "rung", "offset", "minute"])
    E = E[(E.date >= a) & (E.date <= z)].reset_index(drop=True)
    cache, rows = {}, []
    for r in E.itertuples():
        t = np.datetime64(touch_utc(r.date, r.minute).replace(tzinfo=None), "m")
        o = (1 if r.side == "up" else -1) * flip
        rec = dict(inst=r.inst, date=r.date, side=r.side, rung=r.rung, offset=r.offset, minute=r.minute)
        i = int(np.searchsorted(ts, t))
        # thresholds from the sessions strictly before the touch's own UTC date
        k = qdays.get(str(t)[:10])
        if k is None or k < MINHIST or i == 0:
            rows.append(rec)
            continue
        if k not in cache:
            mask = (pos >= max(0, k - HIST)) & (pos < k)
            cache[k] = {w: np.nanquantile(v[mask], [.1, .2, .8, .9]) for w, v in roll.items()}
        q = cache[k]
        for w in (15, 30, 60):
            j0 = int(np.searchsorted(ts, t - np.timedelta64(w, "m")))
            if i - j0 < w * 2 // 3 or (ci[j0:i].min() != ci[j0:i].max()):
                continue
            tot = (buy[j0:i] + sell[j0:i]).sum()
            if tot <= 0:
                continue
            D = (buy[j0:i] - sell[j0:i]).sum() / tot
            moved = o * (cl[i - 1] - cl[j0]) > 0
            p10, p20, p80, p90 = q[w]
            against20, with20 = (D <= p20, D >= p80) if o > 0 else (D >= p80, D <= p20)
            against10, with10 = (D <= p10, D >= p90) if o > 0 else (D >= p90, D <= p10)
            rec.update({f"od{w}": o * D, f"moved{w}": bool(moved), f"ag20_{w}": bool(moved and against20), f"wi20_{w}": bool(moved and with20), f"ag10_{w}": bool(moved and against10), f"wi10_{w}": bool(moved and with10)})
        j120 = int(np.searchsorted(ts, t - np.timedelta64(120, "m")))
        if i - j120 >= 100 and ci[j120:i].min() == ci[j120:i].max():
            bb = blocks_back(ts, hi, lo, delta, t, o)
            if bb:
                f2, f3 = divergences(*bb)
                rec["F2"], rec["F3"] = f2, f3
        rows.append(rec)
    X = pd.DataFrame(rows)
    X["F1"], X["F4"] = X.get("ag20_30"), X.get("wi20_30")
    return X


def features():
    OUT.mkdir(parents=True, exist_ok=True)
    X = pd.concat([features_for(i) for i in MAP], ignore_index=True)
    X.to_parquet(CACHE / "features.parquet", index=False)
    print(len(X), X.groupby("inst").size().to_dict(), flush=True)


def load_lr():
    spec = importlib.util.spec_from_file_location("line_reaction", ROOT / "scripts/forecast_history/line_reaction.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def joined():
    """Touches, flow flags and outcomes, net K by the vol-layer-reaction method."""
    sys.path.insert(0, str(ROOT))
    LR = load_lr()
    X = pd.read_parquet(CACHE / "features.parquet")
    E = pd.concat([pd.read_parquet(EV / f"{i}.parquet") for i in MAP], ignore_index=True)
    E = E.merge(X, on=["inst", "date", "side", "rung", "offset"], how="inner", suffixes=("", "_x"), validate="one_to_one")
    L = pd.read_csv(ROOT / "analysis/output/line_reaction/chosen_lines.csv", usecols=["inst", "date", "open", "sig"])
    E = E.merge(L, on=["inst", "date"], how="left")
    from pylego.costs import default_spread
    sp = pd.read_parquet(ROOT / "features/spread_profile.parquet")
    sp = sp[sp.hour.astype(int).between(10, 19)].groupby("pair")["mean"].median()
    cost = {}
    for sym in MAP:
        key = LR.M1_KEY.get(sym, sym.lower())
        pip = .01 if sym.endswith("JPY") else (1.0 if sym == "NQ" else 1e-4)
        try:
            pips = float(sp.loc[key]) if key in sp.index else float(default_spread(key))
        except Exception:  # noqa: BLE001 - same fallback as vol-layer-reaction
            pips = 2.0
        cost[sym] = pips * pip
    E["cost_K"] = E.inst.map(cost).to_numpy() / (E.open.to_numpy() * E.sig.to_numpy() / 100 * LR.K)
    E["pnl"] = LR._pnl(E)
    E["resolved"] = E.outcome.isin(["reject", "break"])
    E["y"] = (E.outcome == "reject").astype(float)
    return E


def net_k(d, sign):
    raw = sign * d.pnl.to_numpy()
    if sign < 0:
        raw = np.where(d.outcome == "ambiguous", -1.0, raw)
    return raw - d.cost_K.to_numpy(), raw


def boot_mean(x, days, rng, B_=B):
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
        t = (a[:, None] + np.arange(BLOCK)).ravel()
        st[b] = s[t].sum() / max(1, n[t].sum())
    lo, hi = np.percentile(st, [2.5, 97.5])
    return dict(n=len(x), est=float(x.mean()), lo=float(lo), hi=float(hi), p=float(max(2 * min((st <= 0).mean(), (st >= 0).mean()), 1 / B_)))


def contrast(d, flag, rng, B_=B):
    """P(reject) with minus without the flag, flags demeaned within instrument, rung and side, date-block bootstrap."""
    d = d[d[flag].notna() & d.resolved].copy()
    if d.empty or not d[flag].astype(bool).any() or d[flag].astype(bool).all():
        return dict(n=int(d[flag].astype(bool).sum()) if len(d) else 0, m=0, est=None, lo=None, hi=None, p=None)
    d["ry"] = d.y - d.groupby(["inst", "rung", "side"]).y.transform("mean")
    a = d[flag].astype(bool).to_numpy()
    x = d.ry.to_numpy()
    est = float(x[a].mean() - x[~a].mean())
    u = sorted(set(d.date))
    if len(u) < 25 or a.sum() < 5:
        return dict(n=int(a.sum()), m=int((~a).sum()), est=est, lo=None, hi=None, p=None)
    pos = {v: i for i, v in enumerate(u)}
    idx = d.date.map(pos).to_numpy()
    s1, n1 = np.bincount(idx[a], x[a], len(u)), np.bincount(idx[a], minlength=len(u)).astype(float)
    s0, n0 = np.bincount(idx[~a], x[~a], len(u)), np.bincount(idx[~a], minlength=len(u)).astype(float)
    nb = math.ceil(len(u) / BLOCK)
    st = np.empty(B_)
    for b in range(B_):
        q = rng.integers(0, len(u) - BLOCK + 1, nb)
        t = (q[:, None] + np.arange(BLOCK)).ravel()
        st[b] = s1[t].sum() / max(1, n1[t].sum()) - s0[t].sum() / max(1, n0[t].sum())
    lo, hi = np.percentile(st, [2.5, 97.5])
    return dict(n=int(a.sum()), m=int((~a).sum()), est=est, lo=float(lo), hi=float(hi), p=float(max(2 * min((st <= 0).mean(), (st >= 0).mean()), 1 / B_)))


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, top = [0.0] * len(ps), 0.0
    for r, i in enumerate(order):
        top = max(top, min(1.0, ps[i] * (len(ps) - r)))
        adj[i] = top
    return adj


def shuffle_band(d, flag, rng, B_=1000):
    d = d[d[flag].notna() & d.resolved]
    x = (d.y - d.groupby(["inst", "rung", "side"]).y.transform("mean")).to_numpy()
    a = d[flag].astype(bool).to_numpy()
    g = [np.flatnonzero(m) for m in (d.groupby(["inst", "rung", "side"]).ngroup().to_numpy() == v for v in range(d.groupby(["inst", "rung", "side"]).ngroup().max() + 1))]
    out = np.empty(B_)
    for b in range(B_):
        l = a.copy()
        for q in g:
            l[q] = rng.permutation(a[q])
        out[b] = x[l].mean() - x[~l].mean()
    return float(np.percentile(out, 5)), float(np.percentile(out, 95))


def count():
    E = joined()
    S = E[(E.offset == 0) & E.inst.isin(["EURUSD", "USDJPY"])]
    res = dict(touches=S.groupby("inst").size().to_dict(), nq_touches=int(((E.offset == 0) & (E.inst == "NQ")).sum()))
    sd = float(S.pnl.std())
    res["sd_net_K"], res["mean_cost_K"] = sd, S.groupby("inst").cost_K.mean().to_dict()
    for f in PREDICT:
        d = S[S[f].notna() & S.resolved]
        a = d[f].astype(bool)
        n, m = int(a.sum()), int((~a).sum())
        res[f] = dict(signals=n, comparison=m, by_inst=d[a].groupby("inst").size().to_dict(), mde_contrast=3.57 * .5 * math.sqrt(1 / n + 1 / m) if n and m else None, mde_net=3.57 * sd / math.sqrt(n) if n else None)
        nq = E[(E.offset == 0) & (E.inst == "NQ") & E[f].notna() & E.resolved]
        res[f]["nq_signals"], res[f]["nq_comparison"] = int(nq[f].astype(bool).sum()), int((~nq[f].astype(bool)).sum())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "count_first.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


def score():
    rng = np.random.default_rng(SEED)
    E = joined()
    S = E[(E.offset == 0) & E.inst.isin(["EURUSD", "USDJPY"])].copy()
    mid = sorted(S.date.unique())[S.date.nunique() // 2]
    cells = {}
    for f, sign in PREDICT.items():
        c = contrast(S, f, rng)
        for name, sub in (("half1", S[S.date < mid]), ("half2", S[S.date >= mid]), ("EURUSD", S[S.inst == "EURUSD"]), ("USDJPY", S[S.inst == "USDJPY"])):
            c[name] = contrast(sub, f, rng, B_=0 + 200)["est"]
        c["shuffle"] = shuffle_band(S, f, np.random.default_rng(SEED + 1))
        cells[f"C_{f}"] = c
        d = S[S[f].notna() & S[f].astype(bool)]
        x, raw = net_k(d, sign)
        n = boot_mean(x, list(d.date), rng)
        n.update(gross=float(raw.mean()), cost=float(d.cost_K.mean()), half1=float(x[d.date.to_numpy() < mid].mean()), half2=float(x[d.date.to_numpy() >= mid].mean()),
                 EURUSD=float(x[d.inst.to_numpy() == "EURUSD"].mean()), USDJPY=float(x[d.inst.to_numpy() == "USDJPY"].mean()))
        cells[f"N_{f}"] = n
    names = list(cells)
    adj = holm([cells[k]["p"] for k in names])
    held = {}
    for k, a in zip(names, adj):
        c = cells[k]
        c["holm_p"] = a
        f = k[2:]
        sign = PREDICT[f]
        same = all((c[x] > 0) == (c["est"] > 0) for x in ("half1", "half2", "EURUSD", "USDJPY"))
        c["same_sign"] = same
        if k.startswith("C_"):
            lo5, hi95 = c["shuffle"]
            beyond = c["est"] > hi95 if c["est"] > 0 else c["est"] < lo5
            big = abs(c["est"]) >= .10
            clear = c["lo"] > 0 if c["est"] > 0 else c["hi"] < 0
            ok = a < .05 and big and clear and same and beyond
            held[k] = ("pass" if (c["est"] > 0) == (sign > 0) else "mirror") if ok else "no"
        else:
            held[k] = "pass" if a < .05 and c["est"] >= .10 and c["lo"] > 0 and same else "no"
    valid = any(held[f"C_{f}"] == "pass" and held[f"N_{f}"] == "pass" for f in PREDICT)
    anyc = any(v in ("pass", "mirror") for k, v in held.items() if k.startswith("C_"))
    desc = {}
    for f in PREDICT:
        D = {}
        for off in (.2, .3):
            D[f"neighbour_{off}"] = contrast(E[E.inst.isin(["EURUSD", "USDJPY"]) & (E.offset.abs().round(1) == off)], f, rng, B_=400)
        for r in ("p50", "p75", "p90"):
            D[r] = contrast(S[S.rung == r], f, rng, B_=400)
        for sd in sorted(S.side.unique()):
            D[sd] = contrast(S[S.side == sd], f, rng, B_=400)
        D["london"] = contrast(S[S.minute < 780], f, rng, B_=400)
        D["us"] = contrast(S[S.minute >= 780], f, rng, B_=400)
        D["nq"] = contrast(E[(E.offset == 0) & (E.inst == "NQ")], f, rng, B_=400)
        D["x60_signed"] = float((S[S[f].notna() & S[f].astype(bool)].x60).mean())
        desc[f] = D
    var = {}
    for name, flag, sign in (("against_p10_30", "ag10_30", 1), ("with_p10_30", "wi10_30", -1), ("against_p20_15", "ag20_15", 1), ("with_p20_15", "wi20_15", -1), ("against_p20_60", "ag20_60", 1), ("with_p20_60", "wi20_60", -1)):
        var[name] = contrast(S, flag, rng, B_=400)
    out = dict(id="delta-at-line", ranAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), seed=SEED, B=B, prereg="forge/DELTA_AT_LINE_PREREG.md", branch="main", held=held, validated=valid, any_contrast=anyc,
               base=dict(p_reject=float(S[S.resolved].y.mean()), resolved=int(S.resolved.sum()), touches=len(S)), cells=cells, descriptive=desc, variants=var)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "scored.json").write_text(json.dumps(out, indent=1, default=float))
    keep = ["inst", "date", "side", "rung", "offset", "minute", "outcome", "x60", "od30", "F1", "F2", "F3", "F4"]
    E[E.offset == 0][keep].to_csv(OUT / "events.csv", index=False)
    print(json.dumps({k: out[k] for k in ("held", "validated", "any_contrast", "base", "cells")}, default=float))


if __name__ == "__main__":
    {"bars": bars, "features": features, "count": count, "score": score}[sys.argv[1]]()
