"""rates-vol-gap: shared design (features, baseline, cells). Fixed by forge/RATES_VOL_GAP_PREREG.md."""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis" / "output" / "rates-vol-gap"
SEED = 20261021
HALVES = {"explore": ("2016-01-01", "2020-12-31"), "confirm": ("2021-01-01", "2026-08-20")}
FULL_SESSION_MIN = 1000  # minutes; a full NAS100 NY-close session has ~1,380
STATE_MP, STATE_VP = 0.70, 0.40  # rates rich (MOVE >= 70th pct of 252) while equity cheap (VXN <= 40th)


def features(p: pd.DataFrame) -> pd.DataFrame:
    """Everything on row D is known at the 17:00 New York close of session D; outcomes start at D+1."""
    f = pd.DataFrame(index=p.index)
    lpk = np.log(p["pk"].clip(lower=1e-10))
    f["lvxn"] = np.log(p["vxn"])
    f["rv1"] = lpk
    f["rv5"] = np.log(p["pk"].rolling(5).mean())
    f["rv22"] = np.log(p["pk"].rolling(22).mean())
    f["mp"], f["vp"] = p["mp"], p["vp"]
    short = (p["n"] < FULL_SESSION_MIN).astype(float)  # holiday / half sessions
    ev = (p["fomc"] + p["cpi"] + p["nfp"]).clip(upper=1)
    for h in (1, 5, 21):
        fwd = p["pk"][::-1].rolling(h).mean()[::-1].shift(-1)  # mean over D+1..D+h
        f[f"y{h}"] = np.log(fwd)
        for k in ("fomc", "cpi", "nfp"):  # scheduled, known in advance
            f[f"{k}{h}"] = p[k][::-1].rolling(h).sum()[::-1].shift(-1)
        f[f"ev{h}"] = ev[::-1].rolling(h).sum()[::-1].shift(-1)
        f[f"short{h}"] = short[::-1].rolling(h).sum()[::-1].shift(-1)
    nxt = pd.Series(p.index, index=p.index).shift(-1)
    for d in range(5):
        f[f"dow{d}"] = (nxt.dt.dayofweek == d).astype(float)
    return f.dropna(subset=["mp", "vp", "rv22", "lvxn"])


def baseline_cols(h: int) -> list[str]:
    cols = ["lvxn", "vp", "rv1", "rv5", "rv22", f"fomc{h}", f"cpi{h}", f"nfp{h}"]
    if h == 1:
        cols += ["dow0", "dow1", "dow2", "dow3"]  # Friday is the reference
    return cols


def resid(y: np.ndarray, X: np.ndarray) -> np.ndarray:
    X1 = np.column_stack([np.ones(len(X)), X])
    b, *_ = np.linalg.lstsq(X1, y, rcond=None)
    return y - X1 @ b


def partial_corr(df: pd.DataFrame, h: int, sig: str = "mp") -> float:
    """C1 statistic: corr(signal, outcome) after both are residualised on the baseline (Frisch-Waugh)."""
    X = df[baseline_cols(h)].to_numpy()
    ry = resid(df[f"y{h}"].to_numpy(), X)
    rs = resid(df[sig].to_numpy(), X)
    return float(np.corrcoef(ry, rs)[0, 1])


def state_effect(df: pd.DataFrame, h: int, mp: np.ndarray | None = None) -> float:
    """C2 statistic, one-leg matched: among equity-cheap days (VXN pct <= STATE_VP), the mean baseline
    residual (log units) when rates vol is rich (MOVE pct >= STATE_MP) minus when it is not."""
    mp = df["mp"].to_numpy() if mp is None else mp
    ry = resid(df[f"y{h}"].to_numpy(), df[baseline_cols(h)].to_numpy())
    cheap = df["vp"].to_numpy() <= STATE_VP
    a, b = cheap & (mp >= STATE_MP), cheap & (mp < STATE_MP)
    if a.sum() == 0 or b.sum() == 0:
        return float("nan")
    return float(ry[a].mean() - ry[b].mean())


def block_indices(n: int, block: int, rng: np.random.Generator) -> np.ndarray:
    """Moving-block bootstrap index vector of length n."""
    k = int(np.ceil(n / block))
    starts = rng.integers(0, n - block + 1, size=k)
    return (starts[:, None] + np.arange(block)[None, :]).ravel()[:n]


def half(df: pd.DataFrame, name: str) -> pd.DataFrame:
    a, b = HALVES[name]
    return df.loc[a:b]


def load(h: int) -> pd.DataFrame:
    p = pd.read_parquet(OUT / "panel.parquet")
    f = features(p)
    f = f.dropna(subset=[f"y{h}"] + baseline_cols(h))
    return f[(f[f"short{h}"] == 0) & (f["rv1"] > np.log(1e-9))]
