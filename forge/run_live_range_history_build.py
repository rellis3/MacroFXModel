"""LIVE-RANGE-HISTORY build (forge/LIVE_RANGE_HISTORY_PREREG.md): replay every session's hourly lines, extract events.

    python -m forge.run_live_range_history_build
Writes analysis/output/live_range_history/{hours,ev_real,ev_ctrl,hours_ship,ev_ship}.parquet (gitignored output).
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from forge.live_range_replay import (EC, GRID, H, HC, INDEX, load_sessions, offsets_from_frame_fit, replay,
                                     shipped_params)

OUT = Path("analysis/output/live_range_history")
TRAIN_FRAC = 0.60


def cls_of(name):
    return "indices" if name in INDEX else "fx_gold"


def meta(name):
    d = pd.read_csv(H / f"{name}.csv").sort_values("date").reset_index(drop=True)
    s = d["pit_sig_used"]
    d["regime_ratio"] = s / s.shift(1).rolling(250, min_periods=120).median()
    fl = pd.read_csv("analysis/output/jumps/flags_seasonal.csv")
    fl = fl[fl.inst == name][["date", "jump_bns", "z_bns"]]
    d = d.merge(fl, on="date", how="left")
    d = d[(d.last_min >= 1200) & (d.pit_sig_daily > 0)]
    return d[["date", "oos", "pit_sig_daily", "regime_ratio", "jump_bns", "z_bns"]].reset_index(drop=True)


def zeros():
    return (np.zeros((22, 2)), np.zeros((22, 2)), np.zeros((22, 9, 3)), np.zeros((22, 9, 3)))


def pass_a(name):
    """Hourly frame (used/speed/U/Dn) per session, params-free."""
    S = load_sessions(name); M = meta(name); P = zeros(); rows = []
    for d, sg in zip(M.date, M.pit_sig_daily):
        if d not in S or len(S[d][0]) < 60:
            continue
        hrs, o, h, l, c = S[d]
        HT, _ = replay(hrs, o, h, l, c, sg / 100 * o[0], *P, 1.0)
        v = HT[HT[:, 1] == 1]
        rows.append(np.column_stack([np.full(len(v), pd.Timestamp(d).toordinal()), v[:, [0, 3, 4, 5, 6]]]))
    A = np.vstack(rows)
    return name, pd.DataFrame(A, columns=["date", "h", "used", "speed", "U", "Dn"])


def pass_b(args):
    name, idx, params, ship = args
    S = load_sessions(name); M = meta(name)
    hrows, erows, crows = [], [], []
    for d, sg in zip(M.date, M.pit_sig_daily):
        if d not in S or len(S[d]) == 0 or len(S[d][0]) < 60:
            continue
        hrs, o, h, l, c = S[d]
        unit = sg / 100 * o[0]
        do = pd.Timestamp(d).toordinal()
        HT, EV = replay(hrs, o, h, l, c, unit, *params, 1.0)
        v = HT[HT[:, 1] == 1]
        hrows.append(np.column_stack([np.full(len(v), idx), np.full(len(v), do), v]))
        erows.append(np.column_stack([np.full(len(EV), idx), np.full(len(EV), do), EV]))
        if not ship:                                                   # placebo ladders (PATH_MAP Amendment 2)
            rng = np.random.default_rng([idx, do])
            f = rng.uniform(0.7, 0.9) if rng.random() < 0.5 else rng.uniform(1.1, 1.3)
            _, EC_ = replay(hrs, o, h, l, c, unit, *params, f)
            crows.append(np.column_stack([np.full(len(EC_), idx), np.full(len(EC_), do), EC_]))
    cols_h = ["inst", "date"] + HC; cols_e = ["inst", "date"] + EC
    f32 = lambda a, c: pd.DataFrame(np.vstack(a), columns=c).astype(np.float32).assign(
        inst=lambda x: x.inst.astype(np.int16), date=lambda x: x.date.astype(np.int32))
    print("done", name, flush=True)
    return (f32(hrows, cols_h), f32(erows, cols_e), f32(crows, cols_e) if crows else None)


def pass_ctrl2(args):
    """Variant 5: placebo with factors 0.90-0.97 / 1.03-1.10."""
    name, idx, params = args
    S = load_sessions(name); M = meta(name); rows = []
    for d, sg in zip(M.date, M.pit_sig_daily):
        if d not in S or len(S[d][0]) < 60:
            continue
        hrs, o, h, l, c = S[d]
        do = pd.Timestamp(d).toordinal()
        rng = np.random.default_rng([idx, do, 5])
        f = rng.uniform(0.90, 0.97) if rng.random() < 0.5 else rng.uniform(1.03, 1.10)
        _, EV = replay(hrs, o, h, l, c, sg / 100 * o[0], *params, f)
        rows.append(np.column_stack([np.full(len(EV), idx), np.full(len(EV), do), EV]))
    print("done", name, flush=True)
    return pd.DataFrame(np.vstack(rows), columns=["inst", "date"] + EC).astype(np.float32).assign(
        inst=lambda x: x.inst.astype(np.int16), date=lambda x: x.date.astype(np.int32))


def main_ctrl2():
    names = sorted(p.stem for p in H.glob("*.csv"))
    z = np.load(OUT / "fits.npz")
    fit = lambda c: (z[f"{c}_ue"], z[f"{c}_se"], z[f"{c}_oU"], z[f"{c}_oD"])
    with ProcessPoolExecutor(8) as ex:
        res = list(ex.map(pass_ctrl2, [(n, i, fit(cls_of(n))) for i, n in enumerate(names)]))
    pd.concat(res, ignore_index=True).to_parquet(OUT / "ev_ctrl2.parquet")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    names = sorted(p.stem for p in H.glob("*.csv"))
    with ProcessPoolExecutor(8) as ex:
        frames = dict(ex.map(pass_a, names))
    F = pd.concat([f.assign(inst=n) for n, f in frames.items()], ignore_index=True)
    F["cls"] = F.inst.map(cls_of)
    splits, fits = {}, {}
    for cls in ("fx_gold", "indices"):
        C = F[F.cls == cls]
        splits[cls] = float(C.date.quantile(TRAIN_FRAC))
        fits[cls] = offsets_from_frame_fit(C, splits[cls])
        print(cls, "split", pd.Timestamp.fromordinal(int(splits[cls])).date(), flush=True)
    pd.Series({f"split_{k}": v for k, v in splits.items()}).to_json(OUT / "splits.json")
    np.savez(OUT / "fits.npz", **{f"{c}_{k}": a for c, t in fits.items() for k, a in zip(("ue", "se", "oU", "oD"), t)})
    jobs = {"real": [], "ship": []}
    for i, n in enumerate(names):
        jobs["real"].append((n, i, fits[cls_of(n)], False))
        jobs["ship"].append((n, i, shipped_params(cls_of(n)), True))
    pd.Series(names).to_json(OUT / "names.json")
    for tag in ("real", "ship"):
        with ProcessPoolExecutor(8) as ex:
            res = list(ex.map(pass_b, jobs[tag]))
        pd.concat([r[0] for r in res], ignore_index=True).to_parquet(OUT / ("hours.parquet" if tag == "real" else "hours_ship.parquet"))
        pd.concat([r[1] for r in res], ignore_index=True).to_parquet(OUT / ("ev_real.parquet" if tag == "real" else "ev_ship.parquet"))
        if tag == "real":
            pd.concat([r[2] for r in res], ignore_index=True).to_parquet(OUT / "ev_ctrl.parquet")
        print("wrote", tag, flush=True)


if __name__ == "__main__":
    main_ctrl2() if "ctrl2" in sys.argv else main()
