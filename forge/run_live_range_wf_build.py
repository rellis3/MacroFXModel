"""LIVE-RANGE-WALKFORWARD build (forge/LIVE_RANGE_WALKFORWARD_PREREG.md): replay with grids refit every quarter on prior dates only.

    python -m forge.run_live_range_wf_build
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from forge.live_range_replay import EC, H, load_sessions, offsets_from_frame_fit, replay
from forge.run_live_range_history_build import cls_of, meta, pass_a

OUT = Path("analysis/output/live_range_wf")
START = pd.Timestamp("2018-04-01")


def quarter_starts():
    return list(pd.date_range("2018-04-01", "2026-07-01", freq="QS"))


def pass_wf(args):
    name, idx, fits = args           # fits: {quarter_start_ordinal: params}
    S = load_sessions(name); M = meta(name)
    qs = np.array(sorted(fits))
    rows = []
    for d, sg, rr in zip(M.date, M.pit_sig_daily, M.regime_ratio):
        do = pd.Timestamp(d).toordinal()
        if do < qs[0] or d not in S or len(S[d][0]) < 60:
            continue
        P = fits[qs[np.searchsorted(qs, do, side="right") - 1]]
        hrs, o, h, l, c = S[d]
        _, EV = replay(hrs, o, h, l, c, sg / 100 * o[0], *P, 1.0)
        if len(EV):
            rows.append(np.column_stack([np.full(len(EV), idx), np.full(len(EV), do), np.full(len(EV), rr), EV]))
    print("done", name, flush=True)
    return pd.DataFrame(np.vstack(rows), columns=["inst", "date", "regime_ratio"] + EC)


def main():
    names = sorted(p.stem for p in H.glob("*.csv"))
    f = OUT / "frame.parquet"
    if f.exists():
        F = pd.read_parquet(f)
    else:
        with ProcessPoolExecutor(8) as ex:
            F = pd.concat([x.assign(inst=n) for n, x in ex.map(pass_a, names)], ignore_index=True)
        F.to_parquet(f)
    F["cls"] = F.inst.map(cls_of)
    fits = {c: {} for c in ("fx_gold", "indices")}
    for q in quarter_starts():
        qo = q.toordinal()
        for c in fits:
            fits[c][qo] = offsets_from_frame_fit(F[F.cls == c], qo)
    print("fits done", flush=True)
    jobs = [(n, i, fits[cls_of(n)]) for i, n in enumerate(names)]
    with ProcessPoolExecutor(8) as ex:
        res = list(ex.map(pass_wf, jobs))
    E = pd.concat(res, ignore_index=True)
    E.to_parquet(OUT / "events.parquet")
    pd.Series(names).to_json(OUT / "names.json")
    print("wrote", len(E), flush=True)


if __name__ == "__main__":
    main()
