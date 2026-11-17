"""vol-line-touch-layers, step 1: the touch table (prereg forge/VOL_LINE_TOUCH_LAYERS_PREREG.md §3).

One row per first touch of a production PIT vol line (O->H / O->L p50/p75/p90), 34 instruments, 2016-10-24 -> 2026-08-20
(the lockbox from 2026-08-21 is cut before anything is computed). Base + layer inputs (point-in-time), net R for
fade/follow x shapes S1-S3 on real bid/ask (entry at the touch bar close, and +1 lag at the next bar), MFE/MAE.

Reads data from DATA_ROOT (the main checkout); writes analysis/output/vol-line-touch-layers/touches.parquet (not committed).
    python -X utf8 scripts/vol-line-touch-layers/build.py
"""
from __future__ import annotations

import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

WT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path(os.environ.get("DATA_ROOT", "c:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel"))
sys.path[:0] = [str(WT / "scripts/forecast_history")]
from forecast_record import klass  # noqa: E402

HIST = DATA_ROOT / "analysis/output/forecast_history"
BA = DATA_ROOT / "data/m1_bidask"
CHOSEN = DATA_ROOT / "analysis/output/line_reaction/chosen_lines.csv"
JUMPS = DATA_ROOT / "analysis/output/jump-after/events.parquet"
OUT = WT / "analysis/output/vol-line-touch-layers"
BA_KEY = {"DE30": "dax", "SPX500": "spx", "DOW": "dow", "GOLD": "gold", "NQ": "nq", "UK100": "uk100", "US2000": "us2000"}
START, END, DISC_END = "2016-10-24", "2026-08-20", "2022-12-30"
T_LO, T_HI, CLOSE, SESSION = 60, 19 * 60 - 1, 21 * 60, 22 * 60
RUNGS = (("p50", 1), ("p75", 2), ("p90", 3))
BURST0 = "2017-08-30"                        # first jump-after flag (500-session warm-up)
SHAPES = (("S1", 0.25, 0.25), ("S2", 0.5, 0.5), ("S3", 0.5, 0.25))
SIDES = ("fade", "follow")


def instruments():
    return [f.stem for f in sorted(HIST.glob("*.csv")) if (BA / f"{BA_KEY.get(f.stem, f.stem.lower())}_m1.parquet").exists()]


def day_table(sym, chosen, bursts):
    d = pd.read_csv(HIST / f"{sym}.csv", usecols=["date", "open", "pit_sig_used", "r_hl", "rv5", "gap", "event",
                                                 "pit_oh_p50", "pit_oh_p75", "pit_oh_p90", "pit_ol_p50", "pit_ol_p75", "pit_ol_p90"])
    d = d[d.date <= END].sort_values("date").reset_index(drop=True)
    sig = d.pit_sig_used
    last5 = d.rv5.shift(1).rolling(5).mean()
    med = d.rv5.shift(1).rolling(252, min_periods=126).median()
    d["mr5"] = 0.5 * np.log(med / last5)
    e = np.log(d.r_hl.clip(lower=1e-9) / sig)
    ew = e.ewm(halflife=10, adjust=True).mean().shift(1)
    d["err10"] = ew - e.expanding(20).mean().shift(1)
    d["res1"] = e.shift(1)
    d["regime"] = np.log(sig / sig.shift(1).rolling(250, min_periods=120).median())   # stage 3 meta input
    d["gapz"] = (d.gap / sig).abs()
    d["ev"] = d.event.isin(["high", "NFP", "CPI", "FOMC"]).astype(float)
    c = chosen[chosen.inst == sym][["date", "sig"]].rename(columns={"sig": "c_sig"})
    d = d.merge(c, on="date", how="left")
    d["cgap"] = np.log(d.c_sig / sig)
    b = bursts[bursts.inst == sym][["date", "slot", "common"]]
    d = d.merge(b, on="date", how="left")
    return d.set_index("date")


def profile(sym, df):
    """Mean squared 5-minute mid log return per 5-min slot, discovery sessions only; normalised over 00:00-22:00."""
    g = df[df.date <= DISC_END]
    c5 = g.groupby(["date", g.m // 5]).mid.last()
    r5 = np.log(c5).groupby(level=0).diff().dropna()
    p = (r5 ** 2).groupby(level=1).mean().reindex(range(SESSION // 5), fill_value=0.0).to_numpy()
    return p / p.sum()


def trade(side_sgn, ent_i, m, A, a, b, sig_px):
    """side_sgn +1 long / -1 short, entering at bar ent_i close. Returns net R, MFE/MAE (sigma) at 60 min and to CLOSE."""
    if side_sgn > 0:
        fill = A["ask_c"][ent_i]
        tgt, stp = fill + a * sig_px, fill - b * sig_px
    else:
        fill = A["bid_c"][ent_i]
        tgt, stp = fill - a * sig_px, fill + b * sig_px
    j = int(np.searchsorted(m, CLOSE, side="right"))
    sl = slice(ent_i + 1, j)
    if side_sgn > 0:
        hi, lo, op = A["bid_h"][sl], A["bid_l"][sl], A["bid_o"][sl]
        hs = lo <= stp
        ht = hi >= tgt
    else:
        hi, lo, op = A["ask_l"][sl], A["ask_h"][sl], A["ask_o"][sl]
        hs = lo >= stp
        ht = hi <= tgt
    ist = int(np.argmax(hs)) if hs.any() else 10 ** 9
    itg = int(np.argmax(ht)) if ht.any() else 10 ** 9
    if ist <= itg and ist < 10 ** 9:
        x = min(stp, op[ist]) if side_sgn > 0 else max(stp, op[ist])
    elif itg < 10 ** 9:
        x = tgt
    else:
        x = (A["bid_c"] if side_sgn > 0 else A["ask_c"])[j - 1] if j - 1 > ent_i else fill
    r = side_sgn * (x - fill) / (b * sig_px)
    # excursions on mid, in sigma
    mid_h, mid_l = A["mid_h"][sl], A["mid_l"][sl]
    k60 = int(np.searchsorted(m[sl], m[ent_i] + 60, side="right"))
    def exc(h, l):
        if not len(h):
            return 0.0, 0.0
        fav = (h.max() - fill) if side_sgn > 0 else (fill - l.min())
        adv = (fill - l.min()) if side_sgn > 0 else (h.max() - fill)
        return max(fav, 0) / sig_px, max(adv, 0) / sig_px
    f60, a60 = exc(mid_h[:k60], mid_l[:k60])
    fcl, acl = exc(mid_h, mid_l)
    return r, f60, a60, fcl, acl


def build_one(args):
    sym, chosen, bursts = args
    t0 = time.time()
    D = day_table(sym, chosen, bursts)
    df = pd.read_parquet(BA / f"{BA_KEY.get(sym, sym.lower())}_m1.parquet",
                         columns=["time", "bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c"])
    idx = pd.DatetimeIndex(pd.to_datetime(df["time"]).dt.as_unit("ns")).tz_localize("UTC").tz_convert("Europe/London").tz_localize(None)
    codes, uniq = pd.factorize(idx.normalize())
    df["date"] = np.asarray(uniq.strftime("%Y-%m-%d"))[codes]
    df["m"] = idx.hour * 60 + idx.minute
    df = df[(df.date >= START) & (df.date <= END) & (df.m < SESSION)].copy()
    assert df.date.max() <= END, "lockbox breached"
    df["mid"] = 0.5 * (df.bid_c + df.ask_c)
    df["mid_h"] = 0.5 * (df.bid_h + df.ask_h)
    df["mid_l"] = 0.5 * (df.bid_l + df.ask_l)
    prof = profile(sym, df)
    cprof = np.r_[0.0, np.cumsum(prof)]
    rows, rv_hist = [], []
    for date, g in df.groupby("date", sort=True):
        if date not in D.index or len(g) < 600:
            continue
        r = D.loc[date]
        o, sp = float(r.open), float(r.pit_sig_used)
        if not (np.isfinite(o) and np.isfinite(sp) and sp > 0):
            continue
        sig_px = sp / 100 * o
        g = g.sort_values("m")
        m = g.m.to_numpy()
        A = {k: g[k].to_numpy(float) for k in ["bid_o", "bid_h", "bid_l", "bid_c", "ask_o", "ask_h", "ask_l", "ask_c", "mid", "mid_h", "mid_l"]}
        lc = np.log(A["mid"])
        r1 = np.r_[0.0, np.diff(lc)] ** 2
        cum = np.cumsum(r1)
        grid = np.zeros(SESSION + 1)                       # minute-grid cumulative RV (stage 3 rv_pre input)
        np.add.at(grid, m + 1, r1)
        cgrid = np.cumsum(grid)
        ref = rv_hist[-20:]
        runhi, runlo = np.maximum.accumulate(A["mid_h"]), np.minimum.accumulate(A["mid_l"])
        wd = pd.Timestamp(date).dayofweek
        burst_end = (float(r.slot) * 5 + 5) if np.isfinite(r.slot) else np.nan
        for direction, sgn, pre in (("up", 1, "pit_oh_"), ("dn", -1, "pit_ol_")):
            for rn, rk in RUNGS:
                p = float(r[pre + rn])
                if not np.isfinite(p) or p <= 0:
                    continue
                lv = o * (1 + sgn * p / 100)
                hit = np.flatnonzero(A["mid_h"] >= lv) if sgn > 0 else np.flatnonzero(A["mid_l"] <= lv)
                if not len(hit):
                    continue
                i = int(hit[0])
                mi = int(m[i])
                if mi < T_LO or mi > T_HI or i + 2 >= len(m):
                    continue
                e = A["mid"][i]
                def back(k):
                    jj = max(0, int(np.searchsorted(m, mi - k)) - 1)
                    return sgn * (e - A["mid"][jj]) / sig_px
                share_so_far = cprof[mi // 5 + 1]
                rec = {
                    "inst": sym, "date": date, "dir": direction, "rung": rk, "minute": mi, "wd": wd, "sig": sp,
                    "spd15": back(15), "spd60": back(60),
                    "ext_opp": max(0.0, (o - runlo[i]) / sig_px) if sgn > 0 else max(0.0, (runhi[i] - o) / sig_px),
                    "gapz": float(r.gapz), "ev": float(r.ev), "regime": float(r.regime),
                    "rv_pre": (float(np.log(cgrid[mi + 1] / np.median([h[mi + 1] for h in ref])))
                               if len(ref) >= 10 and cgrid[mi + 1] > 0 and np.median([h[mi + 1] for h in ref]) > 0 else np.nan),
                    "mr5": float(r.mr5), "err10": float(r.err10), "cgap": float(r.cgap), "res1": float(r.res1),
                    "burst": float(np.isfinite(burst_end) and burst_end <= mi),
                    "common": float(np.isfinite(burst_end) and burst_end <= mi and bool(r.common)),
                    "since": float(min(600, mi - burst_end)) if (np.isfinite(burst_end) and burst_end <= mi) else 600.0,
                    "vleft": float(cprof[CLOSE // 5] - cprof[mi // 5 + 1]),
                    "spread": float((A["ask_c"][i] - A["bid_c"][i]) / sig_px),
                    "vratio": float(np.log(max(cum[i], 1e-18) / ((sp / 100) ** 2 * max(share_so_far, 1e-6)))),
                    "used": float((runhi[i] - runlo[i]) / sig_px),
                }
                for lag, ent in (("", i), ("_l1", i + 1)):
                    for side in SIDES:
                        sd = sgn if side == "follow" else -sgn
                        for sn, a, b in SHAPES:
                            rr, f60, a60, fcl, acl = trade(sd, ent, m, A, a, b, sig_px)
                            rec[f"r_{side}_{sn}{lag}"] = rr
                        if not lag:
                            rec[f"mfe60_{side}"], rec[f"mae60_{side}"], rec[f"mfe_{side}"], rec[f"mae_{side}"] = f60, a60, fcl, acl
                if date < BURST0:                      # jump-after's detector has no flags before its warm-up ends
                    rec["burst"] = rec["common"] = rec["since"] = np.nan
                rows.append(rec)
        rv_hist.append(cgrid)
    E = pd.DataFrame(rows)
    print(f"{sym}: {len(E):,} touches ({time.time() - t0:.0f}s)", flush=True)
    return E


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chosen = pd.read_csv(CHOSEN, usecols=["inst", "date", "sig"])
    J = pd.read_parquet(JUMPS, columns=["inst", "date", "slot", "kind", "ver"])
    J = J[(J.kind == "flag") & (J.ver == "x")]
    n_mom = J.groupby(["date", "slot"]).inst.transform("size")
    J = J.assign(common=n_mom >= 3).sort_values(["inst", "date", "slot"]).drop_duplicates(["inst", "date"])
    syms = instruments()
    assert len(syms) == 34, syms
    with Pool(6) as p:
        parts = p.map(build_one, [(s, chosen, J) for s in syms])
    E = pd.concat(parts, ignore_index=True)
    E["klass"] = E.inst.map(klass)
    assert E.date.max() <= END and E.date.min() >= START
    E.to_parquet(OUT / "touches.parquet", index=False)
    print("rows", len(E), "discovery", int((E.date <= DISC_END).sum()), "confirm", int((E.date >= "2023-01-01").sum()))


if __name__ == "__main__":
    main()
