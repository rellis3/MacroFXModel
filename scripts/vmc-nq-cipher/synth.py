"""vmc-nq-cipher shuffle null (prereg section 3): K synthetic NQ histories with no real intraday information.

Within each trade date the 1-minute bars are permuted (each bar's open gap, high/low/close relative to its open and
its volume travel together); trade dates are then permuted in blocks of 20 and laid onto the real calendar slots.
Prices are re-chained from the first real price. Each history goes through the same feature build as Stage 0
(s0_dataset.resample/features) and is written to its own directory, exploratory span only.

    python -I scripts/vmc-nq-cipher/synth.py K OUTDIR
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))
import s0_dataset as s0  # noqa: E402
import vmcds  # noqa: E402

SEED = 20261030


def build(k, outdir):
    rng = np.random.default_rng(SEED + 1000 + k)
    b = vmcds.load(1, columns=["t_open", "trade_date", "open", "high", "low", "close", "volume"])
    b = b.reset_index(drop=True)
    lo_ = np.log(b.open.to_numpy())
    lc = np.log(b.close.to_numpy())
    g = lo_ - np.r_[lo_[0], lc[:-1]]                        # gap from previous close to this open
    co, ho, lw = lc - lo_, np.log(b.high.to_numpy()) - lo_, np.log(b.low.to_numpy()) - lo_
    v = b.volume.to_numpy()
    t = b.t_open.to_numpy()
    td = pd.to_datetime(b.trade_date).to_numpy()
    starts = np.r_[0, np.where(td[1:] != td[:-1])[0] + 1]
    ends = np.r_[starts[1:], len(b)]
    nd = len(starts)
    blocks = [np.arange(i, min(i + 20, nd)) for i in range(0, nd, 20)]
    order = np.concatenate([blocks[j] for j in rng.permutation(len(blocks))])
    parts = []
    for slot, src in enumerate(order):
        a, z = starts[src], ends[src]
        p = rng.permutation(z - a) + a                      # within-day permutation of bar contents
        off = t[a:z] - t[a]                                 # the content day's own clock offsets
        parts.append((np.full(z - a, slot), t[starts[slot]] + off, p, np.full(z - a, td[starts[slot]])))
    slot_t = np.concatenate([x[1] for x in parts])
    idx = np.concatenate([x[2] for x in parts])
    tdn = np.concatenate([x[3] for x in parts])
    gg, cc = g[idx], co[idx]
    close_l = lc[0] + np.cumsum(gg + cc) - (gg[0] + cc[0])
    open_l = close_l - cc
    s = pd.DataFrame({"t_open": slot_t, "open": np.exp(open_l), "high": np.exp(open_l + ho[idx]),
                      "low": np.exp(open_l + lw[idx]), "close": np.exp(close_l), "volume": v[idx]})
    s["raw_close"], s["contract"], s["trade_date"] = s.close, "SYN", pd.to_datetime(tdn)
    s = s.sort_values("t_open", kind="stable").drop_duplicates("t_open").reset_index(drop=True)
    s["roll_bar"] = np.int8(0)
    s["is_owner"] = np.int8(0)
    s["gap_before"] = (np.diff(s.t_open.to_numpy(), prepend=s.t_open.iloc[0] - 60) > 60).astype(np.int8)
    out = Path(outdir) / "explore"
    out.mkdir(parents=True, exist_ok=True)
    for tf in vmcds.TFS:
        f = s0.features(s0.resample(s, tf))
        f["session"] = s0.session_label(f.t_open.values)
        f.to_parquet(out / f"{vmcds.tf_name(tf)}.parquet", index=False)


if __name__ == "__main__":
    build(int(sys.argv[1]), sys.argv[2])
