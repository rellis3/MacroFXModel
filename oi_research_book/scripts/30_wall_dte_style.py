#!/usr/bin/env python3
"""wall-dte-style: does the right trade at a strong wall (fade or follow) depend on the wall's own expiry bucket,
the gamma sign, its strength and the London hour?

Prereg (frozen, with its PRE-RESULTS amendments): oi_research_book/WALL_DTE_STYLE_PREREG.md. Seed 20261027.

Phases (run in this order; `count` never computes a race outcome):
    .venv/Scripts/python.exe oi_research_book/scripts/30_wall_dte_style.py build INST   # levels + touches, no outcome
    .venv/Scripts/python.exe oi_research_book/scripts/30_wall_dte_style.py count        # n per cell -> PRE-RESULTS amendment
    .venv/Scripts/python.exe oi_research_book/scripts/30_wall_dte_style.py score        # race outcomes, bootstrap, FDR

Same code path as 17_wall_placebo.py / 24_ripple_walls_placebo.py (touch from the approach side, grid placebo at +-1/+-2
strike increments, (instrument, ISO week) cluster bootstrap), with the 2026-10-24 null-audit corrections that the shared
builder 01_build_daily_dataset.py still lacks (DATA_SPEC section 5 #12, open): every strike is moved to the CFD price by
that day's futures-minus-CFD basis (put-call parity on the settlements, as scripts/null-audit/wall-placebo/basis.py), and
on the CME-inverted pairs (USD/CAD, USD/CHF, USD/JPY) the call/put labels are swapped after the strike is inverted
(production js/oi.js does this). Walls are built here from the raw chains; 01's parquet outputs are not used.

Timing (no lookahead): OI of CME date D is public ~16:00 UTC on the next CME date, so a London session S uses the latest
book D whose next CME date is before S (in practice S = D+2 business days). sigma = 20-session stdev of NY-close log
returns built from M1 (17:00 New York), ending before S opens. Sessions = London calendar date, 00:00-22:00 London.
"""
import sys
import json
import time
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / "oi_research_book"
WORK = BOOK / "data" / "cache" / "wall_dte_style"          # gitignored
RES = BOOK / "data" / "results"
SEED = 20261027
N_BOOT = 2000
LOCK_END = pd.Timestamp("2026-08-21")
BUCKETS = ["0-1", "2-7", "8-45", "46+"]
NEAR = {0, 1}
HOURS = ["A", "B", "C", "D"]                                   # London 00-07, 07-12, 12-16:30, 16:30-22
WINDOW_SIG = 3.0                                               # candidate strikes within +-3 sigma of spot (js/oiProfile.js windowRm)
DISTINCT_SIG = 0.12                                            # top-2 walls > 0.12 rm apart (js/oiProfile.js)
STACK_SIG, FARONLY_SIG, PL_DROP_SIG = 0.10, 0.25, 0.10
RACE_SIG = 0.25
LOCAL_SIG = 0.25                                               # local gamma: strikes within +-0.25 sigma of the wall
NEUTRAL_BAND, NEUTRAL_LOOKBACK, NEUTRAL_MIN = 0.25, 60, 20
GRID_K = [-2, -1, 1, 2]
MIN_DAYS = 400
PASS_PP = 3.0

M1DIR = ROOT / "VolRangeForecaster" / "data" / "m1"
INST = {
    "EUR_USD": dict(sample="FXG", csv="OI Data/EUR_USD.csv", m1="eurusd", inv=False, step=0.005, settle=(13, 59), mult=125_000),
    "GBP_USD": dict(sample="FXG", csv="OI Data/GBP_USD.csv", m1="gbpusd", inv=False, step=0.005, settle=(13, 59), mult=125_000),
    "AUD_USD": dict(sample="FXG", csv="OI Data/AUD_USD.csv", m1="audusd", inv=False, step=0.005, settle=(13, 59), mult=125_000),
    "USD_CAD": dict(sample="FXG", csv="OI Data/USD_CAD.csv", m1="usdcad", inv=True, step=0.005, settle=(13, 59), mult=125_000),
    "USD_CHF": dict(sample="FXG", csv="OI Data/USD_CHF.csv", m1="usdchf", inv=True, step=0.005, settle=(13, 59), mult=125_000),
    "USD_JPY": dict(sample="FXG", csv="OI Data/USD_JPY.csv", m1="usdjpy", inv=True, step=5e-5, settle=(13, 59), mult=125_000),
    "XAU_USD": dict(sample="FXG", csv="oi_recon/databento_oi/XAU_USD.csv", m1="xauusd", inv=False, step=25.0, settle=(12, 29), mult=100),
    "NAS100_USD": dict(sample="IDX", csv="OI Data/NAS100_USD.csv", m1="nas100_usd", inv=False, step=100.0, settle=(14, 59), mult=20),
    "SPX500_USD": dict(sample="IDX", csv="OI Data/SPX500_USD.csv", m1="spx500", inv=False, step=25.0, settle=(14, 59), mult=50),
}


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ prices
def load_m1(inst):
    m = pd.read_parquet(M1DIR / f"{INST[inst]['m1']}_m1.parquet")
    idx = pd.to_datetime(m.index)
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    m = m[["open", "high", "low", "close"]].copy()
    m.index = idx
    return m.sort_index()


def ny_sigma(m):
    """20-session stdev of NY-close log returns; label = date of (NY time + 7h); weekend labels dropped; >= 60 bars."""
    ny = m.index.tz_convert("America/New_York")
    lab = (ny.tz_localize(None) + pd.Timedelta(hours=7)).normalize()
    g = m["close"].groupby(lab)
    d = pd.DataFrame({"close": g.last(), "n": g.size()})
    d = d[(d.index.dayofweek < 5) & (d["n"] >= 60)]
    r = np.log(d["close"]).diff()
    return r.rolling(20).std()                                   # indexed by NY-close label; label L closes 17:00 NY on L


def london_sessions(m):
    lt = m.index.tz_convert("Europe/London")
    mins = lt.hour * 60 + lt.minute
    keep = (mins < 22 * 60) & (lt.dayofweek < 5)
    ld = pd.DatetimeIndex(lt.tz_localize(None)).normalize()
    df = pd.DataFrame({"d": ld[keep], "min": mins[keep], "o": m["open"].values[keep], "h": m["high"].values[keep],
                       "l": m["low"].values[keep], "c": m["close"].values[keep]})
    df = df[df["d"] <= LOCK_END]
    out = {}
    for d, g in df.groupby("d", sort=True):
        if len(g) < 60:
            continue
        out[d] = (g["h"].values, g["l"].values, float(g["o"].values[0]), g["min"].values)
    return out


# ------------------------------------------------------------------ chain
def load_chain(inst):
    c = INST[inst]
    r = pd.read_csv(ROOT / c["csv"], usecols=["date", "expiry", "strike", "right", "settlement", "open_interest"])
    r["date"] = pd.to_datetime(r["date"])
    r = r[r["date"] <= LOCK_END + pd.Timedelta(days=3)]
    r["exp"] = pd.to_datetime(r["expiry"], utc=True).dt.tz_localize(None).dt.normalize()
    r = r.drop(columns="expiry").sort_values(["exp", "strike", "right", "date"])
    r["oi"] = r.groupby(["exp", "strike", "right"], sort=False)["open_interest"].ffill(limit=5)
    return r


def basis_series(inst, chain, m1):
    """Futures (OANDA terms) minus OANDA M1 close at the CME settle minute, front expiry (3-120 DTE), 4 near-ATM strikes."""
    c = INST[inst]
    raw = chain[chain["settlement"].notna() & (chain["settlement"] > 0)].copy()
    raw["dte"] = (raw["exp"] - raw["date"]).dt.days
    raw = raw[(raw["dte"] >= 3) & (raw["dte"] <= 120)]
    p = raw.pivot_table(index=["date", "exp", "dte", "strike"], columns="right", values="settlement", aggfunc="first").dropna().reset_index()
    p["F"] = p["strike"] + p["C"] - p["P"]
    p["atm"] = (p["C"] - p["P"]).abs()
    p = p.sort_values(["date", "exp", "atm"]).groupby(["date", "exp"]).head(4)
    fe = p.groupby(["date", "exp", "dte"])["F"].median().reset_index()
    front = fe.sort_values(["date", "dte"]).groupby("date").head(1).set_index("date")
    Fo = 1.0 / front["F"] if c["inv"] else front["F"]
    ct = m1.index.tz_convert("America/Chicago")
    hh, mm = c["settle"]
    sel = (ct.hour == hh) & (ct.minute == mm)
    S = pd.Series(m1["close"].values[sel], index=pd.DatetimeIndex(ct[sel].tz_localize(None)).normalize())
    S = S[~S.index.duplicated(keep="last")]
    return (Fo - S.reindex(Fo.index)).dropna()


def bs_gamma(spot, strike, sig, t):
    t = np.maximum(t, 1 / 365)
    sig = max(sig, 1e-4)
    d1 = (np.log(spot / strike) + 0.5 * sig ** 2 * t) / (sig * np.sqrt(t))
    return norm.pdf(d1) / (spot * sig * np.sqrt(t))


def bucket_of(dte):
    return np.where(dte <= 1, 0, np.where(dte <= 7, 1, np.where(dte <= 45, 2, 3)))


# ------------------------------------------------------------------ build: walls, placebos, mirror, touches (no outcome)
def build(inst):
    t0 = time.time()
    c = INST[inst]
    WORK.mkdir(parents=True, exist_ok=True)
    m1 = load_m1(inst)
    sig = ny_sigma(m1)
    sess = london_sessions(m1)
    chain = load_chain(inst)
    basis = basis_series(inst, chain, m1)
    log(f"[{inst}] chain {len(chain):,} rows; basis on {len(basis)} dates, median {basis.median():+.5g}; sessions {len(sess)}  ({time.time()-t0:.0f}s)")
    book = chain[chain["oi"].notna() & (chain["oi"] > 0)][["date", "exp", "strike", "right", "oi"]].copy()
    if c["inv"]:
        book["right"] = book["right"].map({"C": "P", "P": "C"})        # CME call on the foreign ccy = OANDA put on USD/xxx
    cme_dates = np.array(sorted(book["date"].unique()))
    groups = {d: g for d, g in book.groupby("date", sort=False)}
    sig_lab = sig.dropna()
    lev_rows, sess_rows = [], []
    absnet_hist = []
    drop = dict(no_book=0, stale_book=0, no_sigma=0, no_basis=0)
    for S in sorted(sess):
        k = np.searchsorted(cme_dates, np.datetime64(S), side="left")    # CME dates strictly before S
        if k < 2:
            drop["no_book"] += 1
            continue
        D = pd.Timestamp(cme_dates[k - 2])                              # book D published on cme_dates[k-1] < S
        if (S - D).days > 7:
            drop["stale_book"] += 1
            continue
        sl = sig_lab[sig_lab.index < S]
        if not len(sl) or (S - sl.index[-1]).days > 5:
            drop["no_sigma"] += 1
            continue
        s_ret = float(sl.iloc[-1])
        bb = basis[(basis.index < S) & (basis.index >= pd.Timestamp(cme_dates[max(k - 3, 0)]))]
        if not len(bb):
            drop["no_basis"] += 1
            continue
        b = float(bb.iloc[-1])
        h, l, op, mins = sess[S]                                        # op = open of the first M1 bar at/after 00:00 London
        sigp = s_ret * op
        Fo = op + b
        spot_n = 1.0 / Fo if c["inv"] else Fo
        g = groups[D]
        g = g[g["exp"] >= S]
        if not len(g):
            drop["no_book"] += 1
            continue
        dte = (g["exp"].values - np.datetime64(S)).astype("timedelta64[D]").astype(int)
        Kn = g["strike"].values.astype(float)
        Ko = 1.0 / Kn if c["inv"] else Kn
        isC = (g["right"].values == "C")
        gam = bs_gamma(spot_n, Kn, s_ret * np.sqrt(252), dte / 365.0)
        gx = g["oi"].values * gam                                        # gamma "size" per contract row
        gex = np.where(isC, 1.0, -1.0) * gx * c["mult"] * spot_n         # dealers long calls, short puts (OANDA labels)
        net = float(gex.sum())
        hist = np.array(absnet_hist[-NEUTRAL_LOOKBACK:])
        if len(hist) >= NEUTRAL_MIN:
            med = float(np.median(hist))
            sign = "neutral" if abs(net) < NEUTRAL_BAND * med else ("pos" if net > 0 else "neg")
        else:
            sign = "unknown"
        absnet_hist.append(abs(net))
        bk = bucket_of(dte)
        listed_n = np.unique(np.round(Kn, 8))
        sess_rows.append(dict(inst=inst, date=S, book=D, sigma=s_ret, sigp=sigp, basis=b, open=op, net=net, sign=sign,
                              n_near=int((bk <= 1).sum())))
        walls = []
        for bi in range(4):
            mb = bk == bi
            if not mb.any():
                continue
            df = pd.DataFrame({"Kn": Kn[mb], "Ko": Ko[mb], "c": np.where(isC[mb], gx[mb], 0.0), "p": np.where(isC[mb], 0.0, gx[mb])})
            agg = df.groupby("Kn").agg(Ko=("Ko", "first"), c=("c", "sum"), p=("p", "sum")).reset_index().sort_values("Ko").reset_index(drop=True)
            inwin = (agg["Ko"] - Fo).abs() <= WINDOW_SIG * sigp
            for side, col, above in (("call", "c", True), ("put", "p", False)):
                cand = agg[inwin & ((agg["Ko"] > Fo) if above else (agg["Ko"] < Fo)) & (agg[col] > 0)]
                if not len(cand):
                    continue
                smax = cand[col].max()
                picked = []
                for i, row in cand.sort_values(col, ascending=False).iterrows():
                    if all(abs(row["Ko"] - agg.at[j, "Ko"]) > DISTINCT_SIG * sigp for j in picked):
                        picked.append(i)
                    if len(picked) == 2:
                        break
                vals = agg[col].values
                for rank, i in enumerate(picked, 1):
                    nb = [vals[j] for j in (i - 2, i - 1, i + 1, i + 2) if 0 <= j < len(vals)]
                    med = float(np.median(nb)) if len(nb) >= 2 else np.nan
                    ratio = np.inf if (med == 0 and vals[i] > 0) else (vals[i] / med if med and med > 0 else np.nan)
                    cls = "strong" if ratio >= 3 else ("moderate" if ratio >= 1.5 else "weak")
                    walls.append(dict(bucket=bi, side=side, rank=rank, Kn=float(agg.at[i, "Kn"]), Ko=float(agg.at[i, "Ko"]),
                                      g=float(vals[i]), share=float(vals[i] / smax), ratio=float(ratio), cls=cls))
        # stacked / far-only among strong walls; local gamma at each wall
        strong = [w for w in walls if w["cls"] == "strong"]
        for w in walls:
            w["stacked"] = w["cls"] == "strong" and any(o is not w and o["bucket"] != w["bucket"] and abs(o["Ko"] - w["Ko"]) <= STACK_SIG * sigp for o in strong)
            w["far_only"] = w["cls"] == "strong" and w["bucket"] >= 2 and not any(o["bucket"] in NEAR and abs(o["Ko"] - w["Ko"]) <= FARONLY_SIG * sigp for o in strong)
            loc = float(gex[np.abs(Ko - w["Ko"]) <= LOCAL_SIG * sigp].sum())
            w["local"] = "pos" if loc > 0 else ("neg" if loc < 0 else "zero")
            w["local_gex"] = loc
        all_wall_Ko = np.array([w["Ko"] for w in walls]) if walls else np.array([])
        stepc = c["step"] * Fo ** 2 if c["inv"] else c["step"]
        for wi, w in enumerate(walls):
            if w["cls"] == "weak":
                continue
            base = dict(inst=inst, date=S, wall_id=f"{S.date()}_{wi}", bucket=w["bucket"], side=w["side"], cls=w["cls"],
                        ratio=w["ratio"], share=w["share"], stacked=w["stacked"], far_only=w["far_only"], local=w["local"],
                        sign=sign, sigp=sigp)
            lev_rows.append({**base, "kind": "wall", "k": 0, "Ko": w["Ko"], "L": w["Ko"] - b})
            for kk in GRID_K:
                Kp = w["Kn"] + kk * c["step"]
                j = np.searchsorted(listed_n, Kp)
                listed = any(0 <= jj < len(listed_n) and abs(listed_n[jj] - Kp) <= 1e-6 * abs(Kp) for jj in (j - 1, j))
                if not listed:
                    continue
                Kpo = 1.0 / Kp if c["inv"] else Kp
                if (Kpo > Fo) != (w["side"] == "call"):
                    continue
                if len(all_wall_Ko) and np.min(np.abs(all_wall_Ko - Kpo)) <= PL_DROP_SIG * sigp:
                    continue
                lev_rows.append({**base, "kind": "placebo", "k": kk, "Ko": Kpo, "L": Kpo - b})
        # mirror: expected-move edges (open +- 1 sigma) and their grid placebos
        for side, E in (("call", op + sigp), ("put", op - sigp)):
            mb = dict(inst=inst, date=S, wall_id=f"{S.date()}_m{side}", bucket=-1, side=side, cls="mirror", ratio=np.nan,
                      share=np.nan, stacked=False, far_only=False, local="na", sign=sign, sigp=sigp)
            lev_rows.append({**mb, "kind": "mirror", "k": 0, "Ko": E + b, "L": E})
            for kk in GRID_K:
                Lp = E + kk * stepc
                if (Lp > op) != (side == "call"):
                    continue
                lev_rows.append({**mb, "kind": "mirror_pl", "k": kk, "Ko": Lp + b, "L": Lp})
    lv = pd.DataFrame(lev_rows)
    # touches (event definition only; the race outcome is computed in `score`)
    tidx = np.full(len(lv), -1)
    tmin = np.full(len(lv), -1)
    for S, sub in lv.groupby("date"):
        h, l, op, mins = sess[S]
        L = sub["L"].values
        call = (sub["side"].values == "call")
        valid = np.where(call, L > op, L < op)
        hit = np.where(call[:, None], h[None, :] >= L[:, None], l[None, :] <= L[:, None])
        any_ = hit.any(axis=1) & valid
        first = hit.argmax(axis=1)
        ii = sub.index.values
        tidx[ii] = np.where(any_, first, -1)
        tmin[ii] = np.where(any_, mins[first], -1)
    lv["touch_bar"] = tidx
    lv["touch_min"] = tmin
    lv["hour"] = pd.cut(lv["touch_min"], [-0.5, 420, 720, 990, 1320], right=False, labels=HOURS).astype(object)
    lv.loc[lv["touch_bar"] < 0, "hour"] = None
    lv.to_parquet(WORK / f"levels_{inst.lower()}.parquet", index=False)
    pd.DataFrame(sess_rows).to_parquet(WORK / f"sessions_{inst.lower()}.parquet", index=False)
    json.dump(drop, open(WORK / f"drops_{inst.lower()}.json", "w"))
    log(f"[{inst}] {len(sess_rows)} sessions scored, dropped {drop}; levels {len(lv):,} "
        f"({lv['kind'].value_counts().to_dict()}); touched {int((lv['touch_bar'] >= 0).sum()):,}  ({time.time()-t0:.0f}s)")


# ------------------------------------------------------------------ populations
def load_levels():
    lv = pd.concat([pd.read_parquet(WORK / f"levels_{i.lower()}.parquet") for i in INST], ignore_index=True)
    lv["sample"] = lv["inst"].map({i: INST[i]["sample"] for i in INST})
    lv["date"] = pd.to_datetime(lv["date"])
    iso = lv["date"].dt.isocalendar()
    lv["cluster"] = lv["inst"] + "_" + iso["year"].astype(str) + "_" + iso["week"].astype(str).str.zfill(2)
    return lv


def with_placebos(lv, wall_mask):
    """Rows of the walls selected by wall_mask plus the placebos attached to those walls; deduplicated per kind by
    (instrument, session, side, level) so a strike that is a wall in two buckets counts once."""
    ids = set(lv.loc[wall_mask, "wall_id"] + "|" + lv.loc[wall_mask, "inst"])
    key = lv["wall_id"] + "|" + lv["inst"]
    sub = lv[key.isin(ids) & lv["kind"].isin(["wall", "placebo"])].copy()
    sub["_lk"] = sub["L"].round(8)
    return sub.drop_duplicates(["inst", "date", "side", "kind", "_lk"])


POPS = {
    "H1": lambda lv: (lv["kind"] == "wall") & (lv["cls"] == "strong") & lv["bucket"].isin([0, 1]) & (lv["sign"] == "pos"),
    "H2": lambda lv: (lv["kind"] == "wall") & (lv["cls"] == "strong") & lv["far_only"] & (lv["sign"] == "pos"),
    "H3": lambda lv: (lv["kind"] == "wall") & (lv["cls"] == "strong") & (lv["sign"] == "neg"),
}
DIRECTION = {"H1": -1, "H2": 0, "H3": +1}


def count():
    lv = load_levels()
    out = {"note": "count-first pass: touches only, no race outcome computed", "cells": []}
    sess = pd.concat([pd.read_parquet(WORK / f"sessions_{i.lower()}.parquet") for i in INST], ignore_index=True)
    sess["sample"] = sess["inst"].map({i: INST[i]["sample"] for i in INST})
    out["sessions"] = {s: {"sessions": int(len(g)), "sign": g["sign"].value_counts().to_dict(),
                           "days_with_near_dte_oi": int((g["n_near"] > 0).sum())} for s, g in sess.groupby("sample")}
    out["sessions_by_inst"] = {i: {"sessions": int(len(g)), "first": str(g["date"].min().date()), "last": str(g["date"].max().date()),
                                   "days_with_near_dte_oi": int((g["n_near"] > 0).sum()), "sign": g["sign"].value_counts().to_dict()}
                               for i, g in sess.groupby("inst")}
    rows = []
    for samp in ("FXG", "IDX"):
        ls = lv[lv["sample"] == samp]
        for H, f in POPS.items():
            sub = with_placebos(ls, f(ls))
            t = sub[sub["touch_bar"] >= 0]
            w, p = t[t["kind"] == "wall"], t[t["kind"] == "placebo"]
            rows.append(dict(sample=samp, H=H, walls=int((sub["kind"] == "wall").sum()), wall_touches=len(w), placebo_touches=len(p),
                             wall_days=int(w["date"].nunique()), wall_inst_days=int(w.groupby(["inst", "date"]).ngroups),
                             per_inst=w["inst"].value_counts().to_dict()))
        # the map: bucket x sign x strength x hour x stacked
        w = ls[(ls["kind"] == "wall") & (ls["touch_bar"] >= 0) & ls["sign"].isin(["pos", "neg"])]
        mp = w.groupby(["bucket", "sign", "cls", "hour", "stacked"])["date"].nunique()
        out[f"map_days_{samp}"] = {"cells_with_n>=400": int((mp >= MIN_DAYS).sum()), "cells_logged": int(len(mp)),
                                   "max": int(mp.max()), "median": float(mp.median())}
    out["cells"] = rows
    RES.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(WORK / "count_first.json", "w"), indent=2, default=str)
    log(json.dumps(out, indent=2, default=str))


# ------------------------------------------------------------------ score
def race(lv):
    """BREAK = 0.25 sigma beyond the level first, BOUNCE = 0.25 sigma back first, by 22:00 London; else unresolved.
    On the touch bar only the break side can be read (the bar arrived from the approach side); a later bar that hits
    both thresholds is ambiguous and counted unresolved."""
    lv = lv.copy()
    orig = lv.index
    lv = lv.reset_index(drop=True)
    out = np.full(len(lv), "none", dtype=object)
    for inst in lv["inst"].unique():
        sess = london_sessions(load_m1(inst))
        li = lv[(lv["inst"] == inst) & (lv["touch_bar"] >= 0)]
        for S, sub in li.groupby("date"):
            h, l, _, mins = sess[pd.Timestamp(S)]
            n = len(h)
            L, sp, tb = sub["L"].values, sub["sigp"].values, sub["touch_bar"].values
            call = sub["side"].values == "call"
            up, dn = L + RACE_SIG * sp, L - RACE_SIG * sp
            hit_up = h[None, :] >= up[:, None]
            hit_dn = l[None, :] <= dn[:, None]
            brk = np.where(call[:, None], hit_up, hit_dn)
            bnc = np.where(call[:, None], hit_dn, hit_up)
            ar = np.arange(n)[None, :]
            after = ar > tb[:, None]
            at = ar == tb[:, None]
            brk_m = brk & (after | at)
            bnc_m = bnc & after
            fb = np.where(brk_m.any(1), brk_m.argmax(1), n + 1)
            fo = np.where(bnc_m.any(1), bnc_m.argmax(1), n + 1)
            res = np.where((fb == n + 1) & (fo == n + 1), "none", np.where(fb < fo, "break", np.where(fo < fb, "bounce", "ambig")))
            out[sub.index.values] = res
        log(f"  race {inst} done")
    return pd.Series(out, index=orig)


class Boot:
    """(instrument, ISO week) cluster bootstrap, ratio of sums, shared resample weights for every statistic in a sample."""

    def __init__(self, clusters, rng):
        self.cl = np.array(sorted(set(clusters)))
        self.pos = {c: i for i, c in enumerate(self.cl)}
        C = len(self.cl)
        draws = rng.integers(0, C, size=(N_BOOT, C))
        self.W = np.zeros((N_BOOT, C), dtype=np.float32)
        for b in range(N_BOOT):
            self.W[b] = np.bincount(draws[b], minlength=C)

    def rate(self, df):
        """bootstrap distribution of the break rate in df (resolved rows; column brk 0/1)."""
        if not len(df):
            return np.full(N_BOOT, np.nan)
        s = df.groupby("cluster")["brk"].agg(["sum", "count"])
        v = np.zeros((2, len(self.cl)), dtype=np.float32)
        ix = [self.pos[c] for c in s.index]
        v[0, ix] = s["sum"].values
        v[1, ix] = s["count"].values
        num, den = self.W @ v[0], self.W @ v[1]
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(den > 0, num / den, np.nan)


def contrast(sub, boot):
    """wall break rate - placebo break rate on resolved touches, pp, with bootstrap CI."""
    t = sub[sub["touch_bar"] >= 0]
    res = t[t["out"].isin(["break", "bounce"])].copy()
    res["brk"] = (res["out"] == "break").astype(float)
    w, p = res[res["kind"].isin(["wall", "mirror"])], res[res["kind"].isin(["placebo", "mirror_pl"])]
    tw, tp = t[t["kind"].isin(["wall", "mirror"])], t[t["kind"].isin(["placebo", "mirror_pl"])]
    rw, rp = (w["brk"].mean() if len(w) else np.nan), (p["brk"].mean() if len(p) else np.nan)
    bd = boot.rate(w) - boot.rate(p)
    bd = bd[np.isfinite(bd)]
    est = 100 * (rw - rp)
    if len(bd) > 100:
        lo, hi = np.percentile(100 * bd, [2.5, 97.5])
        se = float(np.std(100 * bd))
        p_lo, p_hi = (np.sum(bd >= 0) + 1) / (len(bd) + 1), (np.sum(bd <= 0) + 1) / (len(bd) + 1)
    else:
        lo = hi = se = p_lo = p_hi = np.nan
    return dict(n_wall=int(len(w)), n_placebo=int(len(p)), wall_break=100 * rw, placebo_break=100 * rp,
                wall_bounce=100 * (1 - rw) if len(w) else np.nan, placebo_bounce=100 * (1 - rp) if len(p) else np.nan,
                diff_pp=est, lo=float(lo), hi=float(hi), se=se, mde_pp=2.8 * se if se == se else np.nan,
                p_below=float(p_lo), p_above=float(p_hi),
                unres_wall=100 * (1 - len(w) / len(tw)) if len(tw) else np.nan,
                unres_placebo=100 * (1 - len(p) / len(tp)) if len(tp) else np.nan,
                days=int(w["date"].nunique()), inst_days=int(w.groupby(["inst", "date"]).ngroups) if len(w) else 0,
                touches_wall=int(len(tw)))


def simple_diff(sub):
    t = sub[(sub["touch_bar"] >= 0) & sub["out"].isin(["break", "bounce"])]
    b = (t["out"] == "break").astype(float)
    w = b[t["kind"].isin(["wall", "mirror"])]
    p = b[t["kind"].isin(["placebo", "mirror_pl"])]
    return 100 * (w.mean() - p.mean()) if len(w) and len(p) else np.nan, int(len(w))


def judge(c, sub, direction, samp):
    """gate: |diff| >= 3 pp in the stated direction, CI excludes 0, same sign in both date halves, instrument rule,
    >= 400 independent days."""
    est, lo, hi = c["diff_pp"], c["lo"], c["hi"]
    want = np.sign(est) if direction == 0 else direction
    dir_ok = np.sign(est) == want and abs(est) >= PASS_PP
    ci_ok = (lo > 0) if want > 0 else (hi < 0)
    t = sub[(sub["touch_bar"] >= 0)]
    wd = t[t["kind"].isin(["wall", "mirror"]) & t["out"].isin(["break", "bounce"])]["date"]
    mid = wd.median() if len(wd) else None
    halves = []
    if mid is not None:
        for hs in (sub[sub["date"] <= mid], sub[sub["date"] > mid]):
            halves.append(simple_diff(hs)[0])
    halves_ok = len(halves) == 2 and all(h == h and np.sign(h) == want for h in halves)
    insts = [i for i in INST if INST[i]["sample"] == samp]
    per = {i: simple_diff(sub[sub["inst"] == i]) for i in insts}
    agree = sum(1 for i in insts if per[i][0] == per[i][0] and np.sign(per[i][0]) == want)
    inst_ok = agree >= (5 if samp == "FXG" else 2)
    powered = c["days"] >= MIN_DAYS
    p = c["p_below"] if want < 0 else c["p_above"]
    if direction == 0:
        p = min(1.0, 2 * min(c["p_below"], c["p_above"]))
    return dict(dir_ok=bool(dir_ok), ci_ok=bool(ci_ok), halves=[float(h) for h in halves], halves_ok=bool(halves_ok),
                per_inst={i: {"diff_pp": float(per[i][0]) if per[i][0] == per[i][0] else None, "n_wall": per[i][1]} for i in insts},
                inst_agree=int(agree), inst_ok=bool(inst_ok), powered=bool(powered), p=float(p),
                gate=bool(dir_ok and ci_ok and halves_ok and inst_ok and powered), split_date=str(mid.date()) if mid is not None else None)


def bh(ps, q=0.10):
    ps = np.asarray(ps, float)
    m = len(ps)
    order = np.argsort(ps)
    thr = q * (np.arange(1, m + 1)) / m
    ok = ps[order] <= thr
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    out = np.zeros(m, bool)
    out[order[:k]] = True
    return out


def wald_hours(sub, boot):
    """H4: do the wall-minus-placebo differences differ across hour blocks? Wald chi2(3) with bootstrap covariance."""
    ests, draws = [], []
    for hb in HOURS:
        s = sub[sub["hour"] == hb]
        t = s[s["out"].isin(["break", "bounce"])].copy()
        t["brk"] = (t["out"] == "break").astype(float)
        w, p = t[t["kind"] == "wall"], t[t["kind"] == "placebo"]
        if len(w) < 30 or len(p) < 30:
            return None
        ests.append(w["brk"].mean() - p["brk"].mean())
        draws.append(boot.rate(w) - boot.rate(p))
    e, D = np.array(ests), np.array(draws).T
    D = D[np.all(np.isfinite(D), 1)]
    Cm = np.eye(4)[:3] - np.eye(4)[1:]
    v = Cm @ e
    V = np.cov((D @ Cm.T).T)
    from scipy.stats import chi2
    stat = float(v @ np.linalg.solve(V, v))
    return dict(by_hour_pp=[100 * x for x in ests], chi2=stat, p=float(chi2.sf(stat, 3)))


def score():
    t0 = time.time()
    lv = load_levels()
    # Every level stays in the frame: populations are chosen by the parent wall's attributes whether or not the wall
    # itself was touched that session (run 1 dropped untouched levels first, which kept placebos only on sessions where
    # their wall was reached; see RESULTS "Deviations"). The race runs on touched levels; untouched rows get "untouched".
    lv = lv.reset_index(drop=True)
    lv["out"] = "untouched"
    t = lv["touch_bar"] >= 0
    lv.loc[t, "out"] = race(lv[t])
    lv.to_parquet(WORK / "events_scored.parquet", index=False)
    log(f"race done {time.time()-t0:.0f}s; outcomes {lv['out'].value_counts().to_dict()}")
    rng = np.random.default_rng(SEED)
    R = {"id": "wall-dte-style", "seed": SEED, "B": N_BOOT, "ranAt": pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
         "prereg": "oi_research_book/WALL_DTE_STYLE_PREREG.md", "hypotheses": [], "mirror": [], "h2_stacked_gate": {},
         "local_gamma_context": [], "map": [], "outcomes": lv.loc[lv["touch_bar"] >= 0, "out"].value_counts().to_dict()}
    boots = {}
    for samp in ("FXG", "IDX"):
        ls = lv[lv["sample"] == samp]
        boots[samp] = Boot(ls["cluster"].unique(), rng)
    tests = []
    for samp in ("FXG", "IDX"):
        ls, boot = lv[lv["sample"] == samp], boots[samp]
        for H in ("H1", "H2", "H3"):
            sub = with_placebos(ls, POPS[H](ls))
            c = contrast(sub, boot)
            j = judge(c, sub, DIRECTION[H], samp)
            # the mirror: expected-move edges on the same gamma-sign days, same race, same gate
            sgn = "neg" if H == "H3" else "pos"
            ms = ls[ls["kind"].isin(["mirror", "mirror_pl"]) & (ls["sign"] == sgn)]
            ms = ms.assign(_lk=ms["L"].round(8)).drop_duplicates(["inst", "date", "side", "kind", "_lk"])
            mc = contrast(ms, boot)
            mj = judge(mc, ms, DIRECTION[H], samp)
            row = dict(H=H, sample=samp, **c, **j, mirror={**mc, "gate": mj["gate"], "halves": mj["halves"], "inst_agree": mj["inst_agree"]})
            tests.append(row)
            log(f"{samp} {H}: wall {c['wall_break']:.1f}% vs placebo {c['placebo_break']:.1f}% diff {c['diff_pp']:+.2f} "
                f"[{c['lo']:+.2f},{c['hi']:+.2f}] n_wall {c['n_wall']} days {c['days']} gate {j['gate']} | mirror {mc['diff_pp']:+.2f} gate {mj['gate']}")
    # H4 only inside a passing H1 / H3 (decided after BH below)
    pv = [t["p"] for t in tests]
    q = bh(pv)
    for t, qq in zip(tests, q):
        t["bh_pass"] = bool(qq)
    h4 = []
    for t in tests:
        if t["H"] in ("H1", "H3") and t["gate"] and t["bh_pass"]:
            ls = lv[lv["sample"] == t["sample"]]
            sub = with_placebos(ls, POPS[t["H"]](ls))
            w = wald_hours(sub, boots[t["sample"]])
            h4.append(dict(sample=t["sample"], within=t["H"], **(w or {"note": "a block had < 30 resolved wall or placebo events"})))
    if h4:
        ps = [x["p"] for x in h4 if "p" in x] + pv
        qq = bh(ps)
        for x, ok in zip([x for x in h4 if "p" in x], qq[:len([x for x in h4 if "p" in x])]):
            x["bh_pass"] = bool(ok)
    for t in tests:
        mirror_broken = t["mirror"]["gate"]
        if not t["powered"]:
            v = "underpowered"
        elif t["gate"] and t["bh_pass"] and not mirror_broken:
            v = "validated"
        else:
            want = np.sign(t["diff_pp"]) if DIRECTION[t["H"]] == 0 else DIRECTION[t["H"]]
            # null only if the CI rules out the pass bar in the hypothesised direction
            bar_out = (t["hi"] < PASS_PP) if want > 0 else (t["lo"] > -PASS_PP)
            if DIRECTION[t["H"]] == 0:
                bar_out = (t["hi"] < PASS_PP) and (t["lo"] > -PASS_PP)
            v = "null" if bar_out else "underpowered"
        t["verdict"] = v
        t["mirror_broken"] = bool(mirror_broken)
    R["hypotheses"] = tests
    R["H4"] = h4 if h4 else "not scored: neither H1 nor H3 passed in either sample"
    # H2 gate: stacked vs far-only, same day, paired (descriptive)
    for samp in ("FXG", "IDX"):
        ls = lv[(lv["sample"] == samp) & (lv["kind"] == "wall") & (lv["cls"] == "strong") & (lv["sign"] == "pos") & (lv["bucket"] >= 2)]
        ls = ls[ls["out"].isin(["break", "bounce"])].assign(brk=lambda d: (d["out"] == "break").astype(float))
        st, fo = ls[ls["stacked"]], ls[ls["far_only"]]
        both = set(zip(st["inst"], st["date"])) & set(zip(fo["inst"], fo["date"]))
        k = lambda d: d[[x in both for x in zip(d["inst"], d["date"])]]
        sp, fp = k(st), k(fo)
        R["h2_stacked_gate"][samp] = dict(paired_days=len(both), stacked_break=100 * sp["brk"].mean() if len(sp) else None,
                                          far_only_break=100 * fp["brk"].mean() if len(fp) else None,
                                          n_stacked=len(sp), n_far_only=len(fp),
                                          all_stacked_break=100 * st["brk"].mean() if len(st) else None, n_all_stacked=len(st))
    # CONTEXT: local gamma sign at the wall (owner's PRE-RESULTS addition), strong walls, book sign x local sign (x near/far)
    for samp in ("FXG", "IDX"):
        ls, boot = lv[lv["sample"] == samp], boots[samp]
        for bsg in ("pos", "neg"):
            for lsg in ("pos", "neg"):
                for dte_grp, bset in (("all", [0, 1, 2, 3]), ("near 0-7", [0, 1]), ("far 8+", [2, 3])):
                    m = (ls["kind"] == "wall") & (ls["cls"] == "strong") & (ls["sign"] == bsg) & (ls["local"] == lsg) & ls["bucket"].isin(bset)
                    c = contrast(with_placebos(ls, m), boot)
                    R["local_gamma_context"].append(dict(sample=samp, book=bsg, local=lsg, dte=dte_grp, **c))
    # CONTEXT map: bucket x sign x strength x hour x stacked
    mrows = []
    for samp in ("FXG", "IDX"):
        ls, boot = lv[lv["sample"] == samp], boots[samp]
        for bi in range(4):
            for sg in ("pos", "neg"):
                for cls in ("strong", "moderate"):
                    for hb in HOURS:
                        for stk in (False, True):
                            m = (ls["kind"] == "wall") & (ls["bucket"] == bi) & (ls["sign"] == sg) & (ls["cls"] == cls) & (ls["stacked"] == stk)
                            sub = with_placebos(ls, m)
                            sub = sub[sub["hour"] == hb]
                            c = contrast(sub, boot)
                            pp = min(1.0, 2 * min(c["p_below"], c["p_above"])) if c["p_below"] == c["p_below"] else np.nan
                            mrows.append(dict(sample=samp, bucket=BUCKETS[bi], sign=sg, cls=cls, hour=hb, stacked=stk, p2=pp, **c))
    mp = pd.DataFrame(mrows)
    ok = mp["p2"].notna() & (mp["n_wall"] >= 20)
    mp["bh_q10"] = False
    mp.loc[ok, "bh_q10"] = bh(mp.loc[ok, "p2"].values)
    mp["flag_unresolved_gt20"] = (mp["unres_wall"] > 20) | (mp["unres_placebo"] > 20)
    R["map"] = mp.replace({np.nan: None}).to_dict("records")
    R["map_summary"] = dict(cells=int(len(mp)), cells_testable=int(ok.sum()), bh_survivors=int(mp["bh_q10"].sum()),
                            expected_false_at_alpha05=round(0.05 * int(ok.sum()), 1),
                            cells_days_ge_400=int((mp["days"] >= MIN_DAYS).sum()))
    # accounting
    R["accounting"] = {i: json.load(open(WORK / f"drops_{i.lower()}.json")) for i in INST}
    R["unresolved_by_kind"] = (lv[lv["touch_bar"] >= 0].groupby(["sample", "kind"])["out"].apply(lambda s: round(100 * (~s.isin(["break", "bounce"])).mean(), 1))
                               .unstack().to_dict())
    RES.mkdir(parents=True, exist_ok=True)
    json.dump(R, open(RES / "wall_dte_style.json", "w"), indent=2, default=lambda o: None if (isinstance(o, float) and o != o) else (bool(o) if isinstance(o, np.bool_) else (int(o) if isinstance(o, np.integer) else (float(o) if isinstance(o, np.floating) else str(o)))))
    log(f"wrote {RES / 'wall_dte_style.json'}  ({time.time()-t0:.0f}s)")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "build":
        for inst in (sys.argv[2:] or list(INST)):
            build(inst)
    elif cmd == "count":
        count()
    elif cmd == "score":
        score()
