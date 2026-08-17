"""impulse — the scalping question the session-handoff work didn't touch:
does an IMPULSIVE push into a swing low force a buy (a bounce), does an
impulsive push into a swing high force a sell (a fade) — and is that
symmetric, or does one direction work better than the other?

This generalizes `spike_fade.py`'s finding (a big pre-open move tends to
partially reverse) beyond session opens, to any confirmed swing pivot,
anywhere in the day, at a scalping timeframe (M5 by default).

Definitions, kept deliberately close to what's already validated elsewhere
in this repo rather than inventing new machinery:

  swing pivot     `pylego.swing_structure.pivot_highs`/`pivot_lows` — a bar
                  whose high/low is the local extreme within `pivot_n` bars
                  either side. Confirmed (knowable) `pivot_n` bars LATER, not
                  at the pivot bar itself — same causality rule as
                  `forge/levels.py`'s swing levels ("a pivot needs n bars on
                  each side to be confirmed... reading it at bar i is
                  lookahead dressed up as market structure").
  impulsive       the `disp_bars` bars immediately INTO the pivot moved by
                  >= the top-quartile displacement (in prior-bar-ATR units)
                  among all pivots of that kind — a fast, sharp leg, not a
                  slow grind to the same price. The bottom of that
                  distribution ("grind" pivots) is the control group: same
                  pivot definition, no fast leg into it.
  reaction        price change from the CONFIRMATION timestamp (not the
                  pivot bar) over several scalping horizons, in ATR units.

"Forces a buy/sell" is operationalized as a win-rate: does price move at
least a minimal threshold in the expected reversal direction within the
horizon — not just "is the mean reaction positive," which a few large
outliers can fake.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from forge.bars import frame
from pylego.swing_structure import pivot_highs, pivot_lows
from SessionResearch.sessions import SESSION_WINDOWS
from SessionResearch.stats_util import bh_fdr, circular_shift_pvalue, prop_diff_z, spearman_stat

DISP_BARS = 3          # bars immediately into the pivot, measuring "how fast was the leg"
PIVOT_N = 3             # bars each side to confirm a pivot (=15 min either side on M5)
IMPULSE_QUANTILE = 0.75
GRIND_QUANTILE = 0.25
MIN_MOVE_ATR = 0.10     # noise floor: a reaction smaller than this doesn't count as "worked"
HORIZONS_MIN = (5, 15, 30)


def _session_of(hour: np.ndarray) -> np.ndarray:
    out = np.full(len(hour), "late", dtype=object)
    for name, (lo, hi) in SESSION_WINDOWS.items():
        out[(hour >= lo) & (hour < hi)] = name
    return out


def build_impulse_events(m1: pd.DataFrame, tf: str = "m5", pivot_n: int = PIVOT_N,
                         disp_bars: int = DISP_BARS, day_start_hour: int = 0) -> pd.DataFrame:
    """One row per confirmed swing pivot (high or low): its displacement leg
    (impulsive or not) and its post-confirmation reaction at each horizon.

    Batches every price lookup (confirmation price, each horizon's forward
    price) into one vectorized `reindex(..., method='ffill')` per column
    rather than a python-level loop calling `.asof()` per pivot — M5 over 10
    years produces on the order of 10^5 pivots per side, and a per-row asof
    against the full 3.6M-row M1 index does not scale.
    """
    bars = frame(m1, tf, day_start_hour=day_start_hour)
    close_atr0 = bars["atr0"].to_numpy()
    idx_close = bars["close"].to_numpy()
    times = bars.index
    m1_close = m1["close"]

    kinds, idxs, disps, signs = [], [], [], []
    for pivots, kind, sign in ((pivot_lows(bars, pivot_n), "low", -1),
                               (pivot_highs(bars, pivot_n), "high", 1)):
        for p in pivots:
            i = p.idx
            if i + pivot_n >= len(bars):
                continue
            atr = close_atr0[i]
            if not (atr > 0):
                continue
            j = max(0, i - disp_bars)
            disp = (idx_close[i] - idx_close[j]) / atr
            # A "low" pivot formed by an impulsive DOWN leg has disp < 0 (sign=-1 matches);
            # a leg that doesn't even point the expected way isn't the pattern being tested.
            if disp != 0 and np.sign(disp) != sign:
                continue
            kinds.append(kind)
            idxs.append(i)
            disps.append(abs(disp))
            signs.append(sign)

    if not idxs:
        return pd.DataFrame()

    idxs = np.array(idxs)
    confirm_time = times[idxs + pivot_n]
    confirm_atr = close_atr0[idxs]
    confirm_price = m1_close.reindex(confirm_time, method="ffill").to_numpy()

    ev = pd.DataFrame({
        "kind": kinds, "confirm_time": confirm_time, "disp_atr": disps,
        "sign": signs, "atr": confirm_atr, "confirm_price": confirm_price,
    })
    ev["session"] = _session_of(confirm_time.hour.to_numpy())
    for h in HORIZONS_MIN:
        fut_time = confirm_time + pd.Timedelta(minutes=h)
        fut_price = m1_close.reindex(fut_time, method="ffill").to_numpy()
        ev[f"reaction_atr_{h}"] = ((fut_price - ev["confirm_price"]) / ev["atr"]) * -ev["sign"]
    ev = ev.drop(columns=["sign", "atr", "confirm_price"])
    ev = ev.dropna(subset=[f"reaction_atr_{h}" for h in HORIZONS_MIN])

    for kind in ("low", "high"):
        m = ev["kind"] == kind
        cut_hi = ev.loc[m, "disp_atr"].quantile(IMPULSE_QUANTILE)
        cut_lo = ev.loc[m, "disp_atr"].quantile(GRIND_QUANTILE)
        ev.loc[m, "impulsive"] = ev.loc[m, "disp_atr"] >= cut_hi
        ev.loc[m, "grind"] = ev.loc[m, "disp_atr"] <= cut_lo
    return ev


def _win_rate(reaction: np.ndarray) -> float:
    return float((reaction >= MIN_MOVE_ATR).mean())


def run_impulse_study(ev: pd.DataFrame, n_perm: int = 1000, seed: int = 5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []

    for kind in ("low", "high"):
        sub = ev[ev["kind"] == kind]
        imp, grd = sub[sub["impulsive"]], sub[sub["grind"]]
        for h in HORIZONS_MIN:
            col = f"reaction_atr_{h}"
            if len(imp) < 30 or len(grd) < 30:
                continue
            r_imp, r_grd = imp[col].to_numpy(), grd[col].to_numpy()

            # 1. does the impulsive leg produce a bigger reaction than a grind pivot?
            z, p = prop_diff_z(int((r_imp >= MIN_MOVE_ATR).sum()), len(r_imp),
                               int((r_grd >= MIN_MOVE_ATR).sum()), len(r_grd))
            rows.append(dict(kind=kind, horizon_min=h, metric="win_rate_impulse_vs_grind",
                             n=len(r_imp) + len(r_grd), value=_win_rate(r_imp) - _win_rate(r_grd), p=p,
                             win_rate_impulse=_win_rate(r_imp), win_rate_grind=_win_rate(r_grd)))

            # 2. does displacement size predict reaction size, continuously (all pivots of this kind)?
            x, y = sub["disp_atr"].to_numpy(), sub[col].to_numpy()
            rho = spearman_stat(x, y)
            _, p_perm = circular_shift_pvalue(x, y, spearman_stat, n_perm=n_perm, rng=rng)
            rows.append(dict(kind=kind, horizon_min=h, metric="disp_size_vs_reaction_spearman",
                             n=len(sub), value=rho, p=np.nan, p_perm=p_perm))

        # 3. by session, impulse win-rate only (n. b. small-n sessions naturally drop below the floor)
        for name in SESSION_WINDOWS:
            s = imp[imp["session"] == name]
            if len(s) < 30:
                continue
            col = f"reaction_atr_15"
            rows.append(dict(kind=kind, horizon_min=15, metric="win_rate_by_session", session=name,
                             n=len(s), value=_win_rate(s[col].to_numpy()), p=np.nan))

    # 4. symmetry: is the LOW side's win-rate different from the HIGH side's, at each horizon?
    for h in HORIZONS_MIN:
        col = f"reaction_atr_{h}"
        lo = ev[(ev["kind"] == "low") & (ev["impulsive"])][col].to_numpy()
        hi = ev[(ev["kind"] == "high") & (ev["impulsive"])][col].to_numpy()
        if len(lo) < 30 or len(hi) < 30:
            continue
        z, p = prop_diff_z(int((lo >= MIN_MOVE_ATR).sum()), len(lo),
                           int((hi >= MIN_MOVE_ATR).sum()), len(hi))
        rows.append(dict(kind="symmetry", horizon_min=h, metric="low_vs_high_win_rate", n=len(lo) + len(hi),
                         value=_win_rate(lo) - _win_rate(hi), p=p,
                         win_rate_low=_win_rate(lo), win_rate_high=_win_rate(hi)))

    return pd.DataFrame(rows)
