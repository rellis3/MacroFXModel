"""Feature engineering. Every quantity for box k uses minutes <= the last minute of box k, and every scale
(sigma, medians, delta-ratio SDs) uses the previous LOOKBACK sessions only. tests/test_no_lookahead.py proves
this by recomputing on truncated data.

Notation (all fixed in forge/VALUE_MIGRATION_NQ_PREREG.md section 3):
  B        box length in minutes (default 15; boxes aligned to 09:30 NY, k = 0..390/B-1)
  K        migration window in boxes (default 4 = one hour of 15-minute boxes)
  theta    migration threshold in sigma_box units (default 0.5)
  phi      delta-confirmation threshold in prior-session SD units of the window delta ratio (default 0.5)
  sigma1   SD of 1-minute close-to-close changes, previous 20 sessions (points)
  sigma_b  SD of within-session box close-to-close changes, previous 20 sessions (points)
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd
from scipy.stats import norm

from .data import RTH_MINUTES, TICK
from .profile import box_profile

LOOKBACK = 20
STEP_FRAC = 0.10   # a POC/VAH/VAL step counts as up/down when it moves at least 0.10 sigma_b


@dataclass(frozen=True)
class Params:
    B: int = 15
    K: int = 4
    theta: float = 0.5
    phi: float = 0.5
    rv_abs: float = 1.0      # absorption, effort-vs-result form: box volume >= the median for that box index ...
    ei_abs: float = 0.7      # ... and (range / median range) / (volume / median volume) <= 0.7
    phi_a: float = 0.25      # absorption, divergence form: box delta ratio <= -0.25 SD while the box closes >= its open

    def key(self):
        return f"B{self.B}_K{self.K}_th{self.theta}_phi{self.phi}"

    def dict(self):
        return asdict(self)


# ------------------------------------------------------------------ per-session scales (prior sessions only)

def _prior_rolling(daily: pd.Series, how: str = "mean") -> pd.Series:
    r = daily.rolling(LOOKBACK, min_periods=LOOKBACK)
    v = r.mean() if how == "mean" else r.median()
    return v.shift(1)   # session d sees sessions d-20 .. d-1


def session_sigma1(mins: pd.DataFrame) -> pd.Series:
    """sigma1[d] = sqrt(mean over the previous 20 sessions of the squared within-session 1-minute close changes)."""
    dc = mins.groupby("day")["close"].diff()   # NaN at m == 0: the overnight gap never enters
    ss = (dc ** 2).groupby(mins["day"]).mean()
    return np.sqrt(_prior_rolling(ss))


def add_delta_proxy(mins: pd.DataFrame, sigma1: pd.Series) -> pd.DataFrame:
    """Bulk volume classification (Easley, Lopez de Prado & O'Hara 2012), per minute:
         delta_m = V_m * (2 * Phi(dp_m / sigma1) - 1),  dp_m = close_m - close_{m-1}  (close_m - open_m at m = 0)
    Only fills rows whose delta is NaN (tier P). It is a function of the price path: it cannot carry
    information about aggression that price does not already show (prereg section 7)."""
    mins = mins.copy()
    dc = mins.groupby("day")["close"].diff()
    dp = dc.where(mins["m"] > 0, mins["close"] - mins["open"])
    s = mins["day"].map(sigma1)
    proxy = mins["volume"] * (2 * norm.cdf(dp / s) - 1)
    mins["delta"] = mins["delta"].where(mins["delta"].notna(), proxy)
    return mins


# ------------------------------------------------------------------ boxes

def build_boxes(mins: pd.DataFrame, B: int, footprint: dict | None = None) -> pd.DataFrame:
    nb = RTH_MINUTES // B
    rows = []
    for day, g in mins.groupby("day", sort=True):
        o, h, l, c, v, dl = (g[x].values for x in ("open", "high", "low", "close", "volume", "delta"))
        date = g["date"].iat[0]
        for k in range(nb):
            a, z = k * B, (k + 1) * B
            fp = None
            if footprint is not None:
                fp = [footprint[(date, m)] for m in range(a, z) if (date, m) in footprint]
            poc, vah, val = box_profile(l[a:z], h[a:z], v[a:z], c[a:z], fp)
            rows.append((day, date, k, z - 1, o[a], h[a:z].max(), l[a:z].min(), c[z - 1], v[a:z].sum(),
                         np.nansum(dl[a:z]), poc, vah, val))
    return pd.DataFrame(rows, columns=["day", "date", "k", "end_m", "O", "H", "L", "C", "V", "D", "POC", "VAH", "VAL"])


def box_scales(boxes: pd.DataFrame) -> pd.DataFrame:
    """Per-session scales from the previous 20 sessions: sigma_b, per-box-index median volume and range,
    SD of box delta ratio and of K-window delta ratios (the latter filled in states())."""
    bx = boxes.sort_values(["day", "k"])
    dc = bx.groupby("day")["C"].diff()
    sb = np.sqrt(_prior_rolling((dc ** 2).groupby(bx["day"]).mean()))
    dr = (bx["D"] / bx["V"].replace(0, np.nan))
    dr_sd = np.sqrt(_prior_rolling((dr ** 2).groupby(bx["day"]).mean()))
    return pd.DataFrame({"sigma_b": sb, "dr_sd": dr_sd})


def _prior_by_index(boxes: pd.DataFrame, col: str) -> pd.Series:
    """Median of `col` at the same box index over the previous 20 sessions."""
    piv = boxes.pivot(index="day", columns="k", values=col)
    med = piv.rolling(LOOKBACK, min_periods=LOOKBACK).median().shift(1)
    return med.stack().rename(f"med_{col}")


# ------------------------------------------------------------------ states

def _steps(x: np.ndarray, sig: float, K: int) -> tuple[float, int]:
    d = np.diff(x)
    up = int((d >= STEP_FRAC * sig).sum())
    dn = int((d <= -STEP_FRAC * sig).sum())
    return (x[-1] - x[0]) / sig, up - dn


def states(boxes: pd.DataFrame, sigma1: pd.Series, p: Params) -> pd.DataFrame:
    """One row per (day, k) with k >= K: continuous features and the model states in {-1, 0, +1}."""
    bx = boxes.sort_values(["day", "k"]).reset_index(drop=True).copy()
    sc = box_scales(bx)
    bx = bx.join(sc, on="day")
    bx["range"] = bx["H"] - bx["L"]
    mv = _prior_by_index(bx, "V")
    mr = _prior_by_index(bx, "range")
    bx = bx.join(mv, on=["day", "k"]).join(mr, on=["day", "k"])
    bx["dr"] = bx["D"] / bx["V"].replace(0, np.nan)
    bx["sigma1"] = bx["day"].map(sigma1)

    out = []
    K = p.K
    need = int(np.ceil(K / 2))
    for day, g in bx.groupby("day", sort=True):
        sig = g["sigma_b"].iat[0]
        if not np.isfinite(sig) or sig <= 0 or not np.isfinite(g["sigma1"].iat[0]):
            continue
        poc, vah, val = g.POC.values, g.VAH.values, g.VAL.values
        C, H, L, O = g.C.values, g.H.values, g.L.values, g.O.values
        V, D, dr = g.V.values, g.D.values, g.dr.values
        rng, mvv, mrr = g.range.values, g.med_V.values, g.med_range.values
        drsd = g.dr_sd.iat[0]
        for k in range(K, len(g)):
            w = slice(k - K, k + 1)
            mig_poc, cons_poc = _steps(poc[w], sig, K)
            mig_vah, cons_vah = _steps(vah[w], sig, K)
            mig_val, cons_val = _steps(val[w], sig, K)
            tw_c, tw_cc = _steps(C[w], sig, K)
            tw_h, _ = _steps(H[w], sig, K)
            tw_l, _ = _steps(L[w], sig, K)
            Vw = V[k - K + 1:k + 1].sum()
            cd = D[k - K + 1:k + 1].sum() / Vw if Vw > 0 else 0.0
            cd_z = cd / drsd if np.isfinite(drsd) and drsd > 0 else np.nan
            dr_k = dr[k] if np.isfinite(dr[k]) else 0.0
            dr_k1 = dr[k - 1] if np.isfinite(dr[k - 1]) else 0.0
            accel_z = (dr_k - dr_k1) / drsd if np.isfinite(drsd) and drsd > 0 else np.nan
            # absorption, per box j in the window (k-K+1 .. k)
            ab_bull = ab_bear = 0
            for j in range(k - K + 1, k + 1):
                drj = dr[j] / drsd if (np.isfinite(dr[j]) and np.isfinite(drsd) and drsd > 0) else 0.0
                retj = C[j] - O[j]
                cl = (C[j] - L[j]) / rng[j] if rng[j] > 0 else 0.5
                ok = np.isfinite(mvv[j]) and mvv[j] > 0 and np.isfinite(mrr[j]) and mrr[j] > 0 and V[j] > 0
                rv = V[j] / mvv[j] if ok else 0.0
                ei = (rng[j] / mrr[j]) / rv if ok else np.inf
                effort = rv >= p.rv_abs and ei <= p.ei_abs   # heavy volume, little price travel
                # selling aggression that fails to push price lower -> buyers absorbing (bullish), and the mirror
                if (drj <= -p.phi_a and retj >= 0) or (effort and cl >= 0.5):
                    ab_bull += 1
                if (drj >= p.phi_a and retj <= 0) or (effort and cl < 0.5):
                    ab_bear += 1
            R_K = (C[k] - C[k - K]) / sig
            out.append((day, k, g.end_m.values[k], mig_poc, cons_poc, mig_vah, cons_vah, mig_val, cons_val,
                        tw_c, tw_cc, tw_h, tw_l, R_K, cd, cd_z, accel_z, ab_bull, ab_bear,
                        poc[k], vah[k], val[k], poc[k - 1], vah[k - 1], val[k - 1], H[k], L[k], C[k], O[k], sig,
                        g["sigma1"].iat[0]))
    f = pd.DataFrame(out, columns=[
        "day", "k", "end_m", "mig_poc", "cons_poc", "mig_vah", "cons_vah", "mig_val", "cons_val",
        "tw_c", "tw_cc", "tw_h", "tw_l", "R_K", "cd", "cd_z", "accel_z", "ab_bull", "ab_bear",
        "POC", "VAH", "VAL", "POC_prev", "VAH_prev", "VAL_prev", "H", "L", "C", "O", "sigma_b", "sigma1"])
    return classify(f, p)


def classify(f: pd.DataFrame, p: Params) -> pd.DataFrame:
    need = int(np.ceil(p.K / 2))
    tick_s = TICK / f["sigma_b"]
    up_poc = (f.mig_poc >= p.theta) & (f.cons_poc >= need)
    dn_poc = (f.mig_poc <= -p.theta) & (f.cons_poc <= -need)
    f["A_POC"] = np.where(up_poc, 1, np.where(dn_poc, -1, 0))
    up_va = up_poc & (f.mig_vah >= tick_s) & (f.mig_val >= tick_s)
    dn_va = dn_poc & (f.mig_vah <= -tick_s) & (f.mig_val <= -tick_s)
    f["A"] = np.where(up_va, 1, np.where(dn_va, -1, 0))
    # price-only twins: the same rules on box closes (and highs/lows for the value-area legs)
    up_tw = (f.tw_c >= p.theta) & (f.tw_cc >= need)
    dn_tw = (f.tw_c <= -p.theta) & (f.tw_cc <= -need)
    f["TW_POC"] = np.where(up_tw, 1, np.where(dn_tw, -1, 0))
    f["TW_A"] = np.where(up_tw & (f.tw_h >= tick_s) & (f.tw_l >= tick_s), 1,
                         np.where(dn_tw & (f.tw_h <= -tick_s) & (f.tw_l <= -tick_s), -1, 0))
    dconf = np.where(f.A > 0, f.cd_z >= p.phi, np.where(f.A < 0, f.cd_z <= -p.phi, False))
    aconf = np.where(f.A > 0, f.ab_bull > 0, np.where(f.A < 0, f.ab_bear > 0, False))
    f["B"] = np.where(dconf, f.A, 0)
    f["C_"] = np.where(aconf, f.A, 0)
    f["D_"] = np.where(dconf & aconf, f.A, 0)
    return f


MODELS = {"A_POC": "POC migration only (Q1)", "A": "Model A: POC + value-area migration",
          "B": "Model B: A + delta confirmation", "C_": "Model C: A + absorption against the move",
          "D_": "Model D: A + delta + absorption",
          "TW_POC": "price twin of A_POC (box closes)", "TW_A": "price twin of A (closes, highs, lows)"}
