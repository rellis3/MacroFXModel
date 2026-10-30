"""vmc-nq-cipher dataset access: the ONE loader every stage uses.

Stage 0 writes per-timeframe feature tables to analysis/output/vmc-nq-cipher/data/:
    explore/tf<N>.parquet   trade dates <= 2026-08-20 (exploration + validation)
    lockbox/tf<N>.parquet   trade dates >= 2026-08-21 (confirmation only, owner approval)
`load()` refuses the lockbox unless VMC_LOCKBOX_APPROVED=1 is set AND split='lockbox' is asked for explicitly,
and asserts that no exploratory table contains a lockbox date.

Timeframes: 1, 3, 5, 15, 30, 60, 240 minutes (UTC clock bins, labelled at bar open) and 'D' (CME trade date,
17:00 Chicago boundary). Every row carries t_open and t_close (epoch seconds); a higher-timeframe value may be used
on a lower-timeframe row only when its t_close <= the row's t_close (`align`).
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get("VMC_DATA", ROOT / "analysis/output/vmc-nq-cipher/data"))
LOCKBOX_FIRST = pd.Timestamp("2026-08-21")
DISCOVERY_END = pd.Timestamp("2022-12-31")      # discovery <= this trade date; validation after it, to 2026-08-20
TFS = (1, 3, 5, 15, 30, 60, 240, "D")


def tf_name(tf):
    return f"tf{tf}"


def load(tf, split="explore", columns=None, period=None):
    """period: None (all exploratory), 'discovery' or 'validation'."""
    if split == "lockbox":
        if os.environ.get("VMC_LOCKBOX_APPROVED") != "1":
            raise PermissionError("lockbox is confirmation-only; needs the owner's approval (VMC_LOCKBOX_APPROVED=1)")
    elif split != "explore":
        raise ValueError(split)
    d = pd.read_parquet(DATA / split / f"{tf_name(tf)}.parquet", columns=columns)
    if split == "explore":
        td = pd.to_datetime(d["trade_date"]) if "trade_date" in d else None
        if td is not None:
            assert td.max() < LOCKBOX_FIRST, "lockbox date found in the exploratory table"
            if period == "discovery":
                d = d[td <= DISCOVERY_END]
            elif period == "validation":
                d = d[td > DISCOVERY_END]
    return d


def align(base, htf, cols, prefix):
    """Attach htf[cols] to base rows using only HTF bars that had CLOSED by each base row's close."""
    b = base[["t_close"]].reset_index().rename(columns={"index": "_i"}).sort_values("t_close")
    h = htf[["t_close", *cols]].sort_values("t_close").rename(columns={c: f"{prefix}_{c}" for c in cols})
    h = h.rename(columns={"t_close": "_htf_close"})
    m = pd.merge_asof(b, h, left_on="t_close", right_on="_htf_close", direction="backward", allow_exact_matches=True)
    m = m.set_index("_i").sort_index()
    assert (m["_htf_close"].isna() | (m["_htf_close"] <= m["t_close"])).all()
    return m.drop(columns=["t_close"])
