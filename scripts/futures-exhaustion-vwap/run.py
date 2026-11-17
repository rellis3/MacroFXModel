"""futures-exhaustion-vwap: fade vol-line touches toward a FROZEN session VWAP, filtered by exhaustion features.

Prereg: forge/FUTURES_EXHAUSTION_VWAP_PREREG.md (seed 20261117). Touch rules and lines from
scripts/line-touch-mae-futures/build.py.

    python -I scripts/futures-exhaustion-vwap/run.py          # trades.parquet + results
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/line-touch-mae-futures"))
import build as B  # noqa: E402

OUT = ROOT / "analysis/output/futures-exhaustion-vwap"
SEED = 20261117
NBOOT = 2000
HOLDOUT = "2023-01-01"
STOP_SIG = 0.25
COMM = {"NQ": 4 / 5.0, "EURUSD": 4 / 6.25, "GOLD": 4 / 10.0}  # $4 RT in ticks (tick $5 / $6.25 / $10)
COST_TICKS = {k: 2 + v for k, v in COMM.items()}
MIN_K = 30


def session_arrays(g):
    hi, lo, cl = g["high"].to_numpy(float), g["low"].to_numpy(float), g["close"].to_numpy(float)
    v = g["volume"].to_numpy(float)
    tp = (hi + lo + cl) / 3
    cv, cpv, cpv2 = np.cumsum(v), np.cumsum(v * tp), np.cumsum(v * tp * tp)
    with np.errstate(invalid="ignore", divide="ignore"):
        vwap = np.where(cv > 0, cpv / cv, np.nan)
        sd = np.sqrt(np.maximum(np.where(cv > 0, cpv2 / cv, np.nan) - vwap ** 2, 0))
    return hi, lo, cl, v, vwap, sd


def trade(hi, lo, cl, k, L, up, target, stop_d, mode):
    """Walk from bar k. Returns (pnl in price, outcome). fade: short an up line; continue: long an up line."""
    n = len(hi)
    s = 1 if up else -1  # +1 = touch direction is up
    if mode == "fade":
        stop_px = L + s * stop_d
        tgt_px = target
        st_mask = (hi[k:] >= stop_px) if up else (lo[k:] <= stop_px)
        tg_mask = (lo[k:] <= tgt_px) if up else (hi[k:] >= tgt_px)
        tg_mask[0] = False
        dir_ = -s
    else:
        dist = abs(L - target)
        stop_px = L - s * stop_d
        tgt_px = L + s * dist
        st_mask = (lo[k:] <= stop_px) if up else (hi[k:] >= stop_px)
        st_mask[0] = False
        tg_mask = (hi[k:] >= tgt_px) if up else (lo[k:] <= tgt_px)
        dir_ = s
    st = np.flatnonzero(st_mask)
    tg = np.flatnonzero(tg_mask)
    st = st[0] if len(st) else n
    tg = tg[0] if len(tg) else n
    if st == n and tg == n:
        return dir_ * (cl[-1] - L), "time"
    if st <= tg:
        return dir_ * (stop_px - L), "stop"
    return dir_ * (tgt_px - L), "target"


def build(name):
    root, mult, tick, unit = B.MAP[name]
    days = pd.read_parquet(B.ARC / f"{name}_days.parquet")
    f = pd.read_parquet(B.FUT / f"{root}_1m_unadj.parquet", columns=["timestamp", "open", "high", "low", "close",
                                                                       "volume"])
    ts = pd.to_datetime(f["timestamp"], utc=True) - pd.Timedelta(minutes=1)
    lon = ts.dt.tz_convert("Europe/London")
    codes, uniq = pd.factorize(lon.dt.normalize())
    f["lon_date"] = np.asarray(pd.DatetimeIndex(uniq).strftime("%Y-%m-%d"))[codes]
    f["lon_min"] = lon.dt.hour * 60 + lon.dt.minute
    f = f[f["lon_min"] < 22 * 60]
    groups = {d: g for d, g in f.groupby("lon_date", sort=False)}
    rows = []
    for _, d in days.iterrows():
        g = groups.get(d["date"])
        if g is None or len(g) < B.MIN_BAR_SHARE * 22 * 60 or g["lon_min"].iloc[0] > 5:
            continue
        hi, lo, cl, v, vwap, sd = session_arrays(g)
        o = float(g["open"].iloc[0])
        sig = o * d["sigma_used_pct"] / 100.0
        run_hi, run_lo = np.maximum.accumulate(hi), np.minimum.accumulate(lo)
        for kind, sc in B.SCALES.items():
            lv = B.day_levels(o, hi, lo, d, sc)
            names = list(lv)
            mat = np.vstack([lv[x] for x in names])
            cand = {}  # (k, side) -> best touch (outermost level)
            for li, lname in enumerate(names):
                fam, rung = lname.split("_")
                up = B.FAMILIES[fam][0]
                for tn, k in enumerate(B.touches_for_line(hi, lo, lv[lname], up, B.REARM_SIG * sig), start=1):
                    L = float(lv[lname][k])
                    key = (k, up)
                    better = key not in cand or (L > cand[key]["level"] if up else L < cand[key]["level"])
                    if better:
                        cand[key] = {"level": L, "line": lname, "family": fam, "group": B.FAMILY_GROUP[fam],
                                     "rung": rung, "touch_n": tn}
            for (k, up), c in cand.items():
                if k < MIN_K or not np.isfinite(vwap[k - 1]) or sd[k - 1] <= 0:
                    continue
                L = c["level"]
                s = 1 if up else -1
                tgt = float(vwap[k - 1])
                tdist = s * (L - tgt)  # >0 = VWAP on the open side of the line
                base = {"instrument": name, "date": d["date"], "kind": kind, "k": int(k), "lon_hour": int(g["lon_min"].iloc[k] // 60),
                        "side": "up" if up else "dn", "sigma": sig, **c,
                        "stretch": s * (L - vwap[k - 1]) / sd[k - 1],
                        "range_used": (run_hi[k - 1] - run_lo[k - 1]) / sig,
                        "speed": abs(cl[k - 1] - cl[max(k - 31, 0)]) / sig,
                        "vol_ratio": (v[k - 15:k].mean() / v[max(k - 75, 0):k - 15].mean())
                        if v[max(k - 75, 0):k - 15].mean() > 0 else np.nan,
                        "target_dist_ticks": tdist * mult / tick, "stop_ticks": STOP_SIG * sig * mult / tick}
                if tdist * mult / tick < 2:
                    base["skip"] = "vwap_not_open_side"
                    rows.append(base)
                    continue
                stop_d = STOP_SIG * sig
                hk, lk, ck = hi[k:], lo[k:], cl[k:]
                for mode in ("fade", "continue"):
                    pnl, outc = trade(hk, lk, ck, 0, L, up, tgt, stop_d, mode)
                    cost = COST_TICKS[name] * tick / mult
                    base[f"R_{mode}"] = (pnl - cost) / stop_d
                    base[f"R2_{mode}"] = (pnl - 2 * cost) / stop_d
                    base[f"R0_{mode}"] = pnl / stop_d
                    base[f"out_{mode}"] = outc
                base["skip"] = ""
                rows.append(base)
    return pd.DataFrame(rows)


# --- scoring -----------------------------------------------------------------------------------------------------
CONDS = ["baseline", "F1hi", "F2hi", "F3hi", "F3lo", "F4hi", "F4lo", "F5",
         "F1hi&F2hi", "F1hi&F3hi", "F1hi&F5", "F2hi&F3hi", "F2hi&F5"]
FEAT = {"F1": "stretch", "F2": "range_used", "F3": "speed", "F4": "vol_ratio"}


def add_flags(t):
    disc = t[(t.kind == "line") & (t.date < HOLDOUT)]
    cuts = {}
    for inst in t.instrument.unique():
        di = disc[disc.instrument == inst]
        for f, col in FEAT.items():
            lo_c, hi_c = di[col].quantile([1 / 3, 2 / 3])
            cuts[(inst, f)] = (float(lo_c), float(hi_c))
            m = t.instrument == inst
            t.loc[m, f + "hi"] = t.loc[m, col] >= hi_c
            t.loc[m, f + "lo"] = t.loc[m, col] <= lo_c
    for f in FEAT:
        t[f + "hi"] = t[f + "hi"].astype(bool)
        t[f + "lo"] = t[f + "lo"].astype(bool)
    t["F5"] = t.touch_n >= 2
    t["baseline"] = True
    for c in CONDS:
        if "&" in c:
            a, b = c.split("&")
            t[c] = t[a] & t[b]
    return t, cuts


def boot_mean(df, col, rng, B_=NBOOT):
    """Day-block bootstrap of the mean of col: returns (mean, lo, hi, p_one_sided(mean<=0))."""
    if len(df) == 0:
        return (np.nan,) * 4
    g = df.groupby("date")[col].agg(["sum", "count"])
    s, c = g["sum"].to_numpy(), g["count"].to_numpy()
    w = rng.multinomial(len(g), np.full(len(g), 1 / len(g)), size=B_)
    means = (w @ s) / np.maximum(w @ c, 1)
    m = s.sum() / c.sum()
    return float(m), float(np.quantile(means, .025)), float(np.quantile(means, .975)), float((means <= 0).mean())


def bh(p, q=0.10):
    p = np.asarray(p)
    n = len(p)
    o = np.argsort(p)
    thr = q * (np.arange(1, n + 1)) / n
    ok = p[o] <= thr
    k = np.max(np.nonzero(ok)[0]) + 1 if ok.any() else 0
    res = np.zeros(n, bool)
    res[o[:k]] = True
    return res


def score(t):
    rng = np.random.default_rng(SEED)
    tr = t[t.skip == ""]
    cells = []
    for inst in ["NQ", "EURUSD", "GOLD"]:
        for rung in ["p50", "p75", "p90"]:
            for c in CONDS:
                base = tr[(tr.instrument == inst) & (tr.rung == rung) & tr[c]]
                L, P = base[base.kind == "line"], base[base.kind != "line"]
                Ld, Lh = L[L.date < HOLDOUT], L[L.date >= HOLDOUT]
                bl = tr[(tr.instrument == inst) & (tr.rung == rung) & (tr.kind == "line") & (tr.date >= HOLDOUT)]
                r = {"instrument": inst, "rung": rung, "cond": c, "n_disc": len(Ld), "n_hold": len(Lh),
                     "sd_disc": float(Ld.R_fade.std()) if len(Ld) > 1 else np.nan}
                r["disc"] = boot_mean(Ld, "R_fade", rng)
                r["hold"] = boot_mean(Lh, "R_fade", rng)
                r["hold_2x"] = float(Lh.R2_fade.mean()) if len(Lh) else np.nan
                r["gross_disc"] = float(Ld.R0_fade.mean()) if len(Ld) else np.nan
                r["gross_hold"] = float(Lh.R0_fade.mean()) if len(Lh) else np.nan
                Ph = P[P.date >= HOLDOUT]
                r["placebo_hold"] = float(Ph.R_fade.mean()) if len(Ph) else np.nan
                r["baseline_hold"] = float(bl.R_fade.mean()) if len(bl) else np.nan
                r["cont_disc"] = float(Ld.R_continue.mean()) if len(Ld) else np.nan
                r["cont_hold"] = float(Lh.R_continue.mean()) if len(Lh) else np.nan
                r["target_rate_disc"] = float((Ld.out_fade == "target").mean() * 100) if len(Ld) else np.nan
                r["stop_rate_disc"] = float((Ld.out_fade == "stop").mean() * 100) if len(Ld) else np.nan
                r["tgt_ticks_med"] = float(Ld.target_dist_ticks.median()) if len(Ld) else np.nan
                r["stop_ticks_med"] = float(Ld.stop_ticks.median()) if len(Ld) else np.nan
                r["mde"] = 2.8 * r["sd_disc"] / np.sqrt(len(Ld)) if len(Ld) > 1 else np.nan
                cells.append(r)
    pass_bh = bh([c["disc"][3] if np.isfinite(c["disc"][3]) else 1.0 for c in cells])
    for c, ok in zip(cells, pass_bh):
        c["bh_pass"] = bool(ok and c["disc"][0] > 0)
        h = c["hold"]
        c["replicates"] = bool(c["bh_pass"] and h[0] > 0 and h[3] < 0.05)
        c["beats_placebo"] = bool(c["replicates"] and h[0] - c["placebo_hold"] > 0)
        c["beats_baseline"] = bool(c["replicates"] and h[0] - c["baseline_hold"] > 0)
        c["pass"] = bool(c["beats_placebo"] and c["beats_baseline"])
        c["power_ok"] = bool(c["n_disc"] >= 300 and np.isfinite(c["mde"]) and c["mde"] <= 0.10)
    return cells


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    allt = []
    for name in B.MAP:
        t = build(name)
        print(name, len(t), "candidates", flush=True)
        allt.append(t)
    t = pd.concat(allt, ignore_index=True)
    t, cuts = add_flags(t)
    t.to_parquet(OUT / "trades.parquet", index=False)
    cells = score(t)
    passed = [c for c in cells if c["pass"]]
    base = [c for c in cells if c["cond"] == "baseline"]
    if passed:
        verdict = "validated"
    elif all(np.isfinite(c["disc"][2]) and c["disc"][2] < 0.10 and c["hold"][2] < 0.10 for c in base):
        verdict = "null"
    else:
        verdict = "underpowered"
    skips = t[t.kind == "line"].groupby("instrument").skip.apply(lambda s: {"trades": int((s == "").sum()),
                                                                           "vwap_not_open_side": int((s != "").sum())}).to_dict()
    res = {"id": "futures-exhaustion-vwap", "verdict": verdict, "ranAt": datetime.now(timezone.utc).isoformat(),
           "seed": SEED, "B": NBOOT, "prereg": "forge/FUTURES_EXHAUSTION_VWAP_PREREG.md", "branch": "main",
           "holdout": HOLDOUT, "cost_ticks": COST_TICKS, "cuts": {f"{k[0]}|{k[1]}": v for k, v in cuts.items()},
           "skips": {str(k): v for k, v in skips.items()}, "n_pass": len(passed),
           "n_bh": sum(c["bh_pass"] for c in cells), "cells": cells}
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float))
    flat = pd.DataFrame([{**{k: v for k, v in c.items() if not isinstance(v, tuple)},
                          "disc_mean": c["disc"][0], "disc_lo": c["disc"][1], "disc_hi": c["disc"][2], "disc_p": c["disc"][3],
                          "hold_mean": c["hold"][0], "hold_lo": c["hold"][1], "hold_hi": c["hold"][2], "hold_p": c["hold"][3]}
                         for c in cells])
    flat.to_csv(OUT / "cells.csv", index=False)
    pd.set_option("display.width", 250)
    print(flat[["instrument", "rung", "cond", "n_disc", "n_hold", "disc_mean", "disc_lo", "disc_hi", "disc_p",
                "hold_mean", "placebo_hold", "gross_disc", "cont_disc", "target_rate_disc", "stop_rate_disc",
                "tgt_ticks_med", "stop_ticks_med", "bh_pass", "pass"]].round(3).to_string())
    print("VERDICT", verdict, "bh", res["n_bh"], "pass", len(passed))


if __name__ == "__main__":
    main()
