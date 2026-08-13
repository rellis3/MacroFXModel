"""discover — the falsifier. Enumerate every conditional hypothesis, then try
very hard to kill all of them.

This module is the reason the engine is worth building. Generating candidate
rules from levels and context is easy and, on its own, worthless: with ~60
level kinds × 2 approach sides × 2 directions × ~29 context splits × 6 barrier
cells, the search space is roughly **40,000 hypotheses**. Testing 40,000
coin-flips at p<0.05 hands you 2,000 "edges" that are pure noise. Any system
that reports its best cells without accounting for that is not doing research,
it is doing data mining and calling the residue a strategy.

Three defences, in increasing order of how much they hurt:

  1. **Cluster-robust standard errors.** Events are not independent — twenty
     levels get tagged during the same hour of the same trend day, and they
     all win or all lose together. Treating them as 20 independent samples
     inflates every t-stat. Errors are clustered by trading day.

  2. **Benjamini–Hochberg FDR** across *every* cell tested, not just the ones
     that looked interesting. The denominator is the honest count of what the
     search examined.

  3. **The random-level null.** The one that actually settles the argument
     this engine exists to settle. Rebuild the entire pipeline with levels
     whose *prices are randomized* — same count, same per-day placement
     distribution, same everything else — and re-run the identical search. If
     "price reacts at the VAL" is real, real levels must beat random lines.
     If the best random-level cell scores as well as the best real-level cell,
     then the search is measuring its own flexibility, not the market, and no
     amount of FDR correction saves it because the null is not "no effect", it
     is "any line would have done".

The statistic that gets reported is mean R **net of cost**, because that is
the only one that pays. `lift` (mean R minus the pooled mean for the same
barrier cell) is reported alongside it to separate "this level does something"
from "gold went up during the sample".
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Each entry is (split name, function producing a label Series). A cell is
# kind × side × direction × ONE of these × barrier cell. Deliberately shallow:
# every extra dimension of interaction multiplies the search space and the
# amount of edge you must find before it means anything.
SPLITS = ("none", "touch_n", "session", "trend", "atr_pct_t", "wick_t",
          "conf_t", "dayrange_t", "posday_t", "dist_dopen_t")

MIN_N = 100          # events in a cell
MIN_DAYS = 30        # distinct trading days in a cell


def tercile_cuts(df: pd.DataFrame, cols=("atr_pct", "wick_beyond_atr", "day_range_atr",
                                         "pos_in_day_range", "dist_dopen_atr")) -> dict:
    """Tercile boundaries, fitted on TRAIN data only.

    These must be frozen from the training fold and applied unchanged to the
    test fold. Recomputing them on the test fold is a small but real leak: the
    bucket a test event falls into would then depend on the distribution of
    other test events, including ones that come after it.
    """
    return {c: (float(df[c].quantile(1 / 3)), float(df[c].quantile(2 / 3)))
            for c in cols if c in df.columns}


def _tercile(series: pd.Series, cuts: tuple[float, float]) -> pd.Series:
    """Bucket into lo/mid/hi at frozen train cut points.

    On a thin or degenerate training window the 1/3 and 2/3 quantiles can
    coincide (e.g. a feature with a spike at one value) and `pd.cut` requires
    strictly increasing edges — rather than let a small `--years`/`--folds`
    combination crash the whole run over one feature's cut points, a
    degenerate split collapses to a single "all" bucket (no discrimination,
    which is the honest result of there being nothing to discriminate on).
    """
    lo, hi = cuts
    if not (lo < hi):
        return pd.Series(["all"] * len(series), index=series.index, dtype=object)
    return pd.cut(series, [-np.inf, lo, hi, np.inf], labels=["lo", "mid", "hi"])


def add_split_columns(df: pd.DataFrame, cuts: dict) -> pd.DataFrame:
    """Materialize every split's label column using frozen train cut points."""
    df = df.copy()
    df["none"] = "all"
    for src, dst in (("atr_pct", "atr_pct_t"), ("wick_beyond_atr", "wick_t"),
                     ("day_range_atr", "dayrange_t"), ("pos_in_day_range", "posday_t"),
                     ("dist_dopen_atr", "dist_dopen_t")):
        if src in cuts:
            df[dst] = _tercile(df[src], cuts[src]).astype(object)
        else:
            df[dst] = "na"
    df["conf_t"] = pd.cut(df["confluence_n"], [-np.inf, 2, 7, np.inf],
                          labels=["sparse", "medium", "dense"]).astype(object)
    df["touch_n"] = df["touch_n"].astype(object)
    df["day"] = pd.DatetimeIndex(df["time"]).floor("D")
    return df


def _cluster_stats(r: np.ndarray, day_codes: np.ndarray) -> tuple[float, float, int]:
    """(mean, cluster-robust SE of the mean, n_clusters), clustering by day.

    Var(mean) = (1/n²) Σ_g (Σ_{i∈g} (r_i − r̄))². With one event per cluster
    this collapses to the ordinary SE; with twenty correlated events in a day
    it correctly refuses to treat them as twenty samples.
    """
    n = len(r)
    if n == 0:
        return np.nan, np.nan, 0
    mean = float(r.mean())
    dev = r - mean
    sums = np.bincount(day_codes, weights=dev)
    g = int((np.bincount(day_codes) > 0).sum())
    var = float((sums ** 2).sum()) / (n ** 2)
    if g > 1:
        var *= g / (g - 1)               # small-cluster correction
    return mean, float(np.sqrt(var)), g


def scan_cells(lab: pd.DataFrame, splits=SPLITS, min_n: int = MIN_N,
               min_days: int = MIN_DAYS, key: str = "kind",
               directions: tuple[int, ...] = (1, -1),
               only_keys: set | None = None) -> pd.DataFrame:
    """Score every (key × side × direction × split-value × barrier) cell.

    Returns one row per cell with n, n_days, mean R, cluster-robust SE, t, and
    the pooled-baseline lift. No selection is applied here — selection is the
    caller's job and has to be done knowing how many cells were examined.

    `directions` restricts which of long/short get scanned. Exists for
    `confidence_cells` below: a DIRECTION-SPECIFIC split column (the confidence
    score computed for a long thesis is not the same number as for a short
    thesis at the same event) has no meaningful reading against the OTHER
    direction's R, and scanning it anyway would silently double the confidence
    hypothesis count with cells that pair a long-confidence bucket against a
    short outcome.

    `only_keys` restricts which values of `key` get EMITTED as cells, without
    restricting what the baseline is computed from — the baseline (`base`
    below) is always the full `lab` passed in, so a targeted follow-up on one
    level kind still asks "does this beat the market", not "does this beat
    other trades on this same kind", which would be a near-tautology. This
    is what makes it safe to hand-run a single-kind confirmatory check after
    the fact instead of re-deriving the same 28,000-hypothesis pool.
    """
    day_codes, _ = pd.factorize(lab["day"])
    lab = lab.assign(_day_code=day_codes)

    # Pooled baseline per (barrier cell, direction) — what a no-signal trade in
    # the same grid cell earned over the same period. Computed from the FULL
    # frame regardless of `only_keys`, so restricting which cells get emitted
    # never changes what "beating the market" means.
    base: dict[tuple, float] = {}
    for (sl, tp), grp in lab.groupby(["sl_atr", "tp_r"], sort=False):
        base[(sl, tp, 1)] = float(grp["r_long"].mean())
        base[(sl, tp, -1)] = float(grp["r_short"].mean())

    rows = []
    for split in splits:
        gcols = [key, "side", split, "sl_atr", "tp_r"]
        for vals, grp in lab.groupby(gcols, sort=False, observed=True):
            k, side, sval, sl, tp = vals
            if only_keys is not None and k not in only_keys:
                continue
            if len(grp) < min_n:
                continue
            codes = pd.factorize(grp["_day_code"])[0]
            for direction, col in ((1, "r_long"), (-1, "r_short")):
                if direction not in directions:
                    continue
                r = grp[col].to_numpy(dtype=float)
                r = r[np.isfinite(r)]
                if len(r) < min_n:
                    continue
                mean, se, ndays = _cluster_stats(r, codes[:len(r)])
                if ndays < min_days or not (se > 0):
                    continue
                lift = mean - base.get((sl, tp, direction), 0.0)
                rows.append(dict(
                    key=k, side=int(side), split=split, split_value=str(sval),
                    sl_atr=sl, tp_r=tp, direction=direction,
                    n=len(r), n_days=ndays, mean_r=mean, se=se, t=mean / se,
                    # Shifting every observation by a constant leaves the SE
                    # unchanged, so the lift t-stat is just the lift over the
                    # same standard error. `t` asks "does this cell make
                    # money"; `t_lift` asks "does this cell beat taking the
                    # same trade at any level at all" — on a trending
                    # instrument those are very different questions, and only
                    # the second one is about levels.
                    lift=lift, t_lift=lift / se,
                    win_rate=float((r > 0).mean()),
                ))
    return pd.DataFrame(rows)


# Fixed a priori, NOT tuned against any result: "at least 3 of the 4
# pre-registered factors fire". Sweeping this (2 vs 3 vs 4) per level kind
# would turn one hypothesis back into several and is exactly the trap this
# module's own docstring warns about — the threshold is a design decision
# made once, here, before looking at what it does to the numbers.
DEFAULT_CONFIDENCE_THRESHOLD = 3


def confidence_cells(lab: pd.DataFrame, threshold: int = DEFAULT_CONFIDENCE_THRESHOLD,
                     min_n: int = MIN_N, min_days: int = MIN_DAYS,
                     key: str = "kind") -> pd.DataFrame:
    """Score `confidence_{long,short} >= threshold` as its OWN small search —
    deliberately kept separate from `scan_cells`'s 8-way SPLITS pool rather
    than added as a 9th split.

    Two reasons for the separation, not one:

      1. Mixing it in would silently double the existing hypothesis count
         (every kind × side × barrier cell gets tested against confidence too)
         for a factor that was added for a specific reason — cheapening the
         FDR bar paid by the original 8 splits.
      2. A DIRECTION-SPECIFIC split cannot share a single column across both
         directions the way every other split here does (see `scan_cells`'s
         `directions` param) — it needs its own bucketing per direction, so it
         cannot just be appended to `SPLITS` without special-casing it anyway.

    This keeps `key × direction × barrier` as the ENTIRE hypothesis space for
    the confidence gate — for gold's 60 kinds, 2 directions, 6 barrier cells,
    that's 720, not the ~30,000 the base search pays. A real effect that is
    genuinely about confluence should be far easier to see through this much
    smaller multiple-testing bill; if it still isn't visible, that is a strong
    result about the confidence factors, not an artefact of too little power.
    """
    rows = []
    for direction, ccol in ((1, "confidence_long"), (-1, "confidence_short")):
        if ccol not in lab.columns:
            continue
        tagged = lab.assign(_conf_t=np.where(lab[ccol] >= threshold, "hi", "lo"))
        cells = scan_cells(tagged, splits=("_conf_t",), min_n=min_n,
                           min_days=min_days, key=key, directions=(direction,))
        rows.append(cells)
    out = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    if len(out):
        out["threshold"] = threshold
    return out


def _norm_sf(t: np.ndarray) -> np.ndarray:
    """One-sided upper-tail normal p-value (no scipy dependency)."""
    from math import erfc, sqrt
    return np.array([0.5 * erfc(x / sqrt(2.0)) for x in np.asarray(t, dtype=float)])


def add_pvalues(cells: pd.DataFrame, q: float = 0.10,
                stat: str = "t") -> pd.DataFrame:
    """One-sided p-values (we only care about positive expectancy) plus
    Benjamini–Hochberg FDR control at `q` across every cell in the frame.

    BH is applied to the WHOLE frame on purpose. Filtering to promising cells
    first and correcting afterwards is the most common way this step is
    silently defeated.
    """
    cells = cells.copy()
    if cells.empty:
        cells["p"] = []
        cells["bh_pass"] = []
        return cells
    cells["p"] = _norm_sf(cells[stat].to_numpy())
    m = len(cells)
    order = np.argsort(cells["p"].to_numpy())
    ranks = np.empty(m, dtype=int)
    ranks[order] = np.arange(1, m + 1)
    thresh = q * ranks / m
    passed = cells["p"].to_numpy() <= thresh
    # BH step-up: everything at or below the largest passing p-value survives.
    if passed.any():
        cutoff = cells["p"].to_numpy()[passed].max()
        passed = cells["p"].to_numpy() <= cutoff
    cells["bh_rank"] = ranks
    cells["bh_thresh"] = thresh
    cells["bh_pass"] = passed
    cells["n_hypotheses"] = m
    return cells


# ── the random-level null ────────────────────────────────────────────────────

def randomize_levels(levels: pd.DataFrame, m1: pd.DataFrame, rng: np.random.Generator,
                     day_start_hour: int = 0) -> pd.DataFrame:
    """Levels with the same births, lifetimes, kinds and *distance profile* —
    but arbitrary prices.

    The placement is what matters. Randomizing a level to a uniformly silly
    price makes it unreachable, and unreachable levels never fire, so the null
    would trivially "lose" for reasons that have nothing to do with whether
    real levels work. Instead each level keeps its own displacement from the
    prevailing price, resampled from the pool of displacements observed across
    all levels of the same family: a random line that is just as close, just as
    often, and just as likely to be touched — but not at a POC, a pivot, or a
    prior day's high.

    If the search finds as much "edge" on these as on the real zoo, the edge is
    in the search, not in the levels.
    """
    out = levels.copy()
    ref = m1["close"].reindex(pd.DatetimeIndex(out["born"]), method="ffill").to_numpy()
    disp = out["price"].to_numpy() - ref
    for fam, idx in out.groupby("family").groups.items():
        pos = out.index.get_indexer(idx)
        pool = disp[pos]
        pool = pool[np.isfinite(pool)]
        if len(pool) == 0:
            continue
        shuffled = rng.choice(pool, size=len(pos), replace=True)
        # Keep the sign structure of the family (a "high" level sits above,
        # a "low" below) so the null is a displaced line, not a mirrored one.
        shuffled = np.abs(shuffled) * np.sign(np.where(disp[pos] == 0, 1, disp[pos]))
        new_price = ref[pos] + shuffled
        width = (out["hi"].to_numpy()[pos] - out["lo"].to_numpy()[pos]) / 2.0
        out.iloc[pos, out.columns.get_loc("price")] = new_price
        out.iloc[pos, out.columns.get_loc("lo")] = new_price - width
        out.iloc[pos, out.columns.get_loc("hi")] = new_price + width
    return out.dropna(subset=["price"])


def null_reference(best_stat: float, null_stats: np.ndarray) -> dict:
    """Where the real search's best cell sits in the null search's best-cell
    distribution. This is the number to read first in any report."""
    null_stats = np.asarray([s for s in null_stats if np.isfinite(s)])
    if len(null_stats) == 0:
        return {"n_null_runs": 0}
    return {
        "n_null_runs": int(len(null_stats)),
        "real_best_t": float(best_stat),
        "null_best_t_mean": float(null_stats.mean()),
        "null_best_t_max": float(null_stats.max()),
        "p_vs_null": float((null_stats >= best_stat).mean()),
    }
