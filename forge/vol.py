"""vol — does a faster, realized-calibrated volatility estimator beat the
incumbent, and does it actually explain the COG gap?

This module answers a specific, pre-scoped question left open in
`MD files/COG_GAP_FINDINGS.md` and never run: this repo's live daily-range
forecaster (`js/volForecast.js`, ported to Python in
`VolRangeForecaster/vol_range_forecast.py`) uses a 30-day Yang-Zhang
volatility estimator as its production primary for FX and gold. That
diagnostic found it is the STICKIEST (slowest-reacting) estimator in its own
family — it can sit frozen at the same value three sessions straight — and
separately, independent of anything to do with COG, the forecaster's own
bands were checked against real OANDA realized High-Low range and found too
WIDE (a 34% exceed-rate against a 50% target: realized rarely reaches the
forecast median). The documented conclusion was "don't chase COG's level,
that just re-widens already-too-wide bands — the right target is COG-like
RESPONSIVENESS with band WIDTH calibrated to realized range, not to COG's
level." A next step was written down (a faster estimator, width recalibrated
to realized, walk-forward IS/OOS, ≥30 OOS windows) and explicitly marked
"deferred, not yet run." This module runs it.

Two things this module does NOT try to do, on purpose:

  * It does not re-derive whether COG's own numbers are well-calibrated —
    that would need COG's actual history, which this repo doesn't have past
    a handful of hand-pasted days. It tests THIS repo's forecaster against
    REAL realized data, which is the honest, answerable version of the
    question.
  * It does not touch COG's separate discretionary NQ direction/execution
    system. That has n=2 forward-logged days and no historical options-
    positioning data to backtest against — nothing here would be a real test.

Scoring is calibration, not P&L, because this is a magnitude question, not a
directional one: **pinball (quantile) loss**, the proper scoring rule for a
percentile forecast (minimized exactly at the true quantile, unlike squared
error), plus the same **exceed-rate** convention this repo's own hit-rate
backfill already uses (does the realized move clear the forecast median
about half the time), so a result here reads against a metric this codebase
already trusts.

The "null" for a magnitude-forecasting question isn't a randomization control
the way it is for the directional/cross-sectional work — shuffling which
day's realized range attaches to which forecast doesn't test anything
meaningful. The analogous skeptical control here is a **naive, non-adaptive
baseline**: a flat, slowly-updating estimate of the instrument's long-run
volatility with no day-to-day responsiveness at all. If a fast estimator
doesn't beat that, the responsiveness bought nothing.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from forge.bars import load_m1, resample

# Feller driftless-Brownian-motion range-distribution constants — the same
# textbook result `js/cogReverseEngineer.js`'s FELLER constant and
# `VolRangeForecaster/vol_range_forecast.py`'s hardcoded multipliers use.
# Public, standard math (not anything proprietary to reproduce carefully) —
# High-Low range of a driftless Brownian motion has a known distribution
# (Feller 1951); P50/P75 are its median/75th-percentile multipliers on daily
# sigma. Open-Close displacement is half-normal; HN_P50/HN_P75 are its
# median/75th-percentile multipliers.
FELLER = {"BM_P50": 1.572, "BM_P75": 2.049, "HN_P50": 0.7979, "HN_P75": 1.284}
SQRT252 = float(np.sqrt(252))


# ── volatility estimators — all CAUSAL: value at row i uses only rows <= i ──

def yang_zhang_sigma(daily: pd.DataFrame, window: int) -> np.ndarray:
    """Yang-Zhang OHLC volatility estimator, rolling `window` days, annualized
    (%). Implemented from the published formula (Yang & Zhang, 2000), not
    ported from `js/volForecast.js` — same "generate from the validated spec,
    not the code" discipline as every other regenerated brick in this repo
    (`PYTHON_LEGO.md`), and it means this and the JS version can be checked
    for agreement rather than one silently being a copy of the other's bugs.

    σ²_YZ = σ²_overnight + k·σ²_open-close + (1−k)·σ²_Rogers-Satchell, with
    Yang-Zhang's minimum-variance weight `k = 0.34 / (1.34 + (n+1)/(n−1))`.
    Zero-drift Rogers-Satchell handles the intraday range component; the
    other two terms handle the close-to-open gap and the day's own drift.
    """
    o, h, l, c = (daily[col].to_numpy(dtype=float) for col in ("open", "high", "low", "close"))
    prev_c = np.empty_like(c)
    prev_c[0] = np.nan
    prev_c[1:] = c[:-1]

    with np.errstate(divide="ignore", invalid="ignore"):
        overnight = np.log(o / prev_c)             # close(t-1) -> open(t)
        oc = np.log(c / o)                          # open(t) -> close(t)
        u = np.log(h / o)                            # open(t) -> high(t)
        d = np.log(l / o)                            # open(t) -> low(t)
    rs = u * (u - oc) + d * (d - oc)                # Rogers-Satchell per-day term

    n = window
    k = 0.34 / (1.34 + (n + 1) / (n - 1))

    var_on = pd.Series(overnight).rolling(n).var(ddof=1).to_numpy()
    var_oc = pd.Series(oc).rolling(n).var(ddof=1).to_numpy()
    var_rs = pd.Series(rs).rolling(n).mean().to_numpy()   # RS is already zero-drift

    var_yz = var_on + k * var_oc + (1 - k) * var_rs
    daily_sigma = np.sqrt(np.maximum(var_yz, 0.0))
    return daily_sigma * SQRT252 * 100.0            # annualized %


def ewma_sigma(daily: pd.DataFrame, lam: float, min_periods: int = 20) -> np.ndarray:
    """EWMA close-to-close volatility AS OF THE CLOSE of each day, annualized
    (%). Standard RiskMetrics recursion, `σ²_t = λσ²_{t-1} + (1−λ)r_t²`,
    incorporating day t's OWN return — the natural definition, and the same
    convention `yang_zhang_sigma` uses (its rolling window also ends ON day
    t, using day t's own OHLC). Neither this nor `yang_zhang_sigma` nor
    `naive_expanding_sigma` below is forecast-ready by itself — see
    `as_of_yesterday` for the one, explicit place that turns "today's own
    volatility measurement" into "what I could have known before today
    happened." Keeping that shift out of each individual estimator function
    is deliberate: this module started with EWMA and the naive baseline
    pre-shifted while `yang_zhang_sigma` wasn't, three silently different
    causal conventions living in one estimator dict — exactly the kind of
    per-function inconsistency this repo's prefix-invariance tests exist to
    catch, caught here before it shipped instead of after.
    """
    c = daily["close"].to_numpy(dtype=float)
    r = np.empty_like(c)
    r[0] = np.nan
    r[1:] = np.log(c[1:] / c[:-1])

    n = len(r)
    out = np.full(n, np.nan)
    if n <= min_periods:
        return out
    seed_var = float(np.nanvar(r[1:min_periods + 1], ddof=1))
    var = seed_var
    out[min_periods] = var
    for i in range(min_periods + 1, n):
        var = lam * var + (1 - lam) * r[i] ** 2      # today's own return
        out[i] = var
    return np.sqrt(np.maximum(out, 0.0)) * SQRT252 * 100.0


def naive_expanding_sigma(daily: pd.DataFrame, min_periods: int = 60) -> np.ndarray:
    """The skeptical baseline: the expanding-window average close-to-close
    volatility AS OF THE CLOSE of each day (day t's own return included, same
    convention as the other two estimators above) — the least adaptive
    estimate possible short of a hardcoded constant. If a responsive
    estimator can't beat this once both are shifted to forecast-ready by
    `as_of_yesterday`, the responsiveness isn't earning its keep."""
    c = daily["close"].to_numpy(dtype=float)
    r = np.empty_like(c)
    r[0] = np.nan
    r[1:] = np.log(c[1:] / c[:-1])
    r2 = r ** 2
    cum = pd.Series(r2).expanding(min_periods=min_periods).mean().to_numpy()
    return np.sqrt(np.maximum(cum, 0.0)) * SQRT252 * 100.0


ESTIMATORS = {
    "ewma_094": lambda d: ewma_sigma(d, 0.94),
    "ewma_090": lambda d: ewma_sigma(d, 0.90),
    "yz_10": lambda d: yang_zhang_sigma(d, 10),
    "yz_20": lambda d: yang_zhang_sigma(d, 20),
    "yz_30": lambda d: yang_zhang_sigma(d, 30),      # the incumbent production primary
    "naive": lambda d: naive_expanding_sigma(d),      # the skeptical baseline
}
# Every estimator above measures day t's OWN volatility, using day t's own
# OHLC/return — a consistent, natural convention. None of them are forecasts
# by themselves.


def as_of_yesterday(sigma_as_of_close: np.ndarray) -> np.ndarray:
    """The ONE place a same-day sigma measurement becomes a forecast for that
    day: shift every estimator's output forward by one day. `forecast[t]` is
    then `sigma_as_of_close[t-1]` — what was actually knowable before day t's
    own bar existed. Applied uniformly to every candidate in `ESTIMATORS` so
    a comparison between them can never accidentally compare one estimator's
    causal version against another's same-day one."""
    out = np.empty_like(sigma_as_of_close)
    out[0] = np.nan
    out[1:] = sigma_as_of_close[:-1]
    return out


# ── mapping sigma -> a predicted daily range, and scoring the forecast ──────

def predicted_quantiles(sigma_annual_pct: np.ndarray, width_mult: dict | None = None) -> dict:
    """sigma (annualized %) -> predicted High-Low and Open-Close quantiles
    (% of price), via the Feller constants (or a `width_mult` override fit
    on realized data — see `fit_width_multiplier`). `level(%) = C ×
    (sigma_annual_pct / sqrt(252))`, the same shape as
    `js/cogReverseEngineer.js`'s reconstruction formula.
    """
    c = width_mult or FELLER
    daily_sigma_pct = sigma_annual_pct / SQRT252
    return {
        "hl_p50": c["BM_P50"] * daily_sigma_pct, "hl_p75": c["BM_P75"] * daily_sigma_pct,
        "oc_p50": c["HN_P50"] * daily_sigma_pct, "oc_p75": c["HN_P75"] * daily_sigma_pct,
    }


def realized_quantities(daily: pd.DataFrame) -> dict:
    """Actual daily High-Low and |Open-Close| as % of that day's open —
    what each `predicted_quantiles` line is trying to forecast."""
    o, h, l, c = (daily[col].to_numpy(dtype=float) for col in ("open", "high", "low", "close"))
    return {"hl_pct": (h - l) / o * 100.0, "oc_pct": np.abs(c - o) / o * 100.0}


def fit_width_multiplier(sigma_daily_pct: np.ndarray, realized_pct: np.ndarray,
                         q: float) -> float:
    """The `q`-th quantile of `realized / sigma`, fit on TRAIN data only and
    frozen — the "correct width" half of the repo's own prescription
    (`ratio_yz`: `σ × trailing_quantile(realized ÷ σ)`), calibrated to
    realized range rather than to COG's or Feller's theoretical constant.
    """
    ratio = realized_pct / np.where(sigma_daily_pct > 0, sigma_daily_pct, np.nan)
    ratio = ratio[np.isfinite(ratio)]
    if len(ratio) < 30:
        return float("nan")
    return float(np.quantile(ratio, q))


def pinball_loss(actual: np.ndarray, predicted: np.ndarray, tau: float) -> np.ndarray:
    """The proper scoring rule for a quantile forecast: minimized in
    expectation exactly when `predicted` IS the true tau-quantile of
    `actual`'s distribution, unlike squared error (which targets the mean).
    Lower is better; 0 only if every prediction is exact.
    """
    diff = actual - predicted
    return np.where(diff >= 0, tau * diff, (tau - 1) * diff)


def exceed_rate(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Fraction of days the realized value exceeded the prediction — the
    house convention `js/hitRateBackfill.js` already uses. A well-calibrated
    median forecast should exceed ~50% of the time; a well-calibrated 75th
    percentile should exceed ~25%."""
    ok = np.isfinite(actual) & np.isfinite(predicted)
    if not ok.any():
        return float("nan")
    return float((actual[ok] > predicted[ok]).mean())


# ── panel + walk-forward: which estimator, which width source, wins OOS ────

def build_forecast_frame(daily: pd.DataFrame) -> pd.DataFrame:
    """One row per day: every estimator's FORECAST-READY sigma (`as_of_
    yesterday` applied uniformly) alongside that day's realized HL/OC.
    `ESTIMATORS["naive"]` sits in this same frame and competes in the same
    grid as every adaptive estimator — not a separately hard-coded
    benchmark — so the walk-forward selection can honestly choose it if nothing
    faster earns its keep OOS."""
    realized = realized_quantities(daily)
    out = pd.DataFrame({"date": daily.index, "hl_pct": realized["hl_pct"],
                        "oc_pct": realized["oc_pct"]})
    for name, fn in ESTIMATORS.items():
        out[f"sigma_{name}"] = as_of_yesterday(fn(daily))
    return out.dropna(subset=["hl_pct", "oc_pct"]).reset_index(drop=True)


WIDTH_SOURCES = ("feller", "fit")
QUANTILE_TARGETS = (("hl_pct", "hl_p50", 0.50), ("hl_pct", "hl_p75", 0.75))
# Selection is on HIGH-LOW only (median + 75th) — the quantity a stop/target
# distance is actually sized from. Open-Close is still scored and reported
# for the frozen winner, as a secondary diagnostic, not a selection criterion
# — folding a third and fourth target into the same score would let a spec
# "win" by being mediocre at everything instead of good at the one thing
# that matters most for sizing.
ALL_TARGETS = (("hl_pct", "hl_p50", 0.50), ("hl_pct", "hl_p75", 0.75),
              ("oc_pct", "oc_p50", 0.50), ("oc_pct", "oc_p75", 0.75))


def _fit_multiplier_set(frame: pd.DataFrame, estimator: str) -> dict:
    """Fit all four Feller-slot multipliers from TRAIN data for one
    estimator — the "correct width" half of the repo's own prescription,
    calibrated to REALIZED range, never to COG's or Feller's constant."""
    daily_sigma = frame[f"sigma_{estimator}"].to_numpy() / SQRT252
    return {
        "BM_P50": fit_width_multiplier(daily_sigma, frame["hl_pct"].to_numpy(), 0.50),
        "BM_P75": fit_width_multiplier(daily_sigma, frame["hl_pct"].to_numpy(), 0.75),
        "HN_P50": fit_width_multiplier(daily_sigma, frame["oc_pct"].to_numpy(), 0.50),
        "HN_P75": fit_width_multiplier(daily_sigma, frame["oc_pct"].to_numpy(), 0.75),
    }


def _score(frame: pd.DataFrame, estimator: str, width_mult: dict, min_n: int = 60) -> dict | None:
    """Combined HL pinball loss (the selection score) + full per-target
    breakdown + exceed-rates, for one frozen (estimator, width_mult) spec on
    `frame`. Returns None if there isn't enough finite data to score."""
    sigma = frame[f"sigma_{estimator}"].to_numpy()
    pred = predicted_quantiles(sigma, width_mult)
    ok = np.isfinite(sigma)
    n = int(ok.sum())
    if n < min_n:
        return None

    detail = {}
    hl_losses = []
    for col, key, tau in ALL_TARGETS:
        actual = frame[col].to_numpy()
        loss = pinball_loss(actual, pred[key], tau)
        detail[f"pinball_{key}"] = float(np.nanmean(loss[ok]))
        detail[f"exceed_{key}"] = exceed_rate(actual, pred[key])
        if col == "hl_pct":
            hl_losses.append(loss[ok])
    combined = float(np.mean(np.concatenate(hl_losses))) if hl_losses else float("nan")
    return {"n": n, "combined_hl_pinball": combined, **detail}


@dataclass
class VolSpec:
    """A frozen volatility-forecast configuration: which sigma estimator,
    which width multipliers (either raw Feller or realized-fit), when it was
    trained. Reading it out loud: 'forecast daily range using a `estimator`
    sigma, scaled by `width_mult`.'"""
    estimator: str
    width_source: str
    width_mult: dict
    trained_through: str
    n_hypotheses: int
    train_stat: dict = field(default_factory=dict)
    fold: int = 0

    def describe(self) -> str:
        src = "Feller theoretical constants" if self.width_source == "feller" else \
              "realized-range-fit multipliers (train-only)"
        return (f"{self.estimator} sigma x {src} "
                f"| train combined HL pinball={self.train_stat.get('combined_hl_pinball', float('nan')):.4f}")

    def to_dict(self) -> dict:
        return {"estimator": self.estimator, "width_source": self.width_source,
                "width_mult": self.width_mult, "fold": self.fold,
                "trained_through": self.trained_through, "n_hypotheses": self.n_hypotheses,
                "train_stat": self.train_stat, "human": self.describe()}


def design_vol(train: pd.DataFrame, estimators=tuple(ESTIMATORS)) -> VolSpec:
    """Score every (estimator x width_source) combination on TRAIN by
    combined HL pinball loss and freeze the winner (lowest loss — unlike the
    directional/cross-sectional work, lower is better here, not higher t)."""
    candidates = []
    for est in estimators:
        for src in WIDTH_SOURCES:
            mult = FELLER if src == "feller" else _fit_multiplier_set(train, est)
            if any(not np.isfinite(v) for v in mult.values()):
                continue
            s = _score(train, est, mult)
            if s is None:
                continue
            candidates.append({"estimator": est, "width_source": src, "width_mult": mult, **s})
    n_hyp = len(estimators) * len(WIDTH_SOURCES)
    if not candidates:
        return VolSpec(estimators[0], "feller", FELLER, "", n_hyp,
                       train_stat={"combined_hl_pinball": float("nan"), "n": 0})
    best = min(candidates, key=lambda c: c["combined_hl_pinball"])
    return VolSpec(best["estimator"], best["width_source"], best["width_mult"],
                   str(train["date"].max()), n_hyp, train_stat=best)


def apply_vol_spec(spec: VolSpec, test: pd.DataFrame) -> dict | None:
    """The frozen spec's realized calibration on unseen data."""
    return _score(test, spec.estimator, spec.width_mult)


def fold_bounds(dates: pd.Series, n_folds: int, min_train_frac: float = 0.4) -> list[tuple]:
    """Same expanding-window scheme as `validate.fold_bounds`/`xsect.
    fold_bounds`, duplicated rather than imported for the same reason
    `xsect.py` gives: this module answers a different question (per-
    instrument calibration, not per-event cells or a cross-sectional
    ranking) and the shape match today is coincidence, not shared logic."""
    t = pd.DatetimeIndex(dates).sort_values()
    start, end = t[0], t[-1]
    span = end - start
    first = start + span * min_train_frac
    edges = pd.date_range(first, end, periods=n_folds + 1)
    return [(start, edges[i], edges[i + 1]) for i in range(n_folds)]


def walk_forward_vol(frame: pd.DataFrame, n_folds: int = 6, verbose: bool = True) -> dict:
    """Design -> freeze -> score, fold by fold. Returns per-fold detail plus
    the concatenated OOS record (one row per fold with its frozen spec's OOS
    score) — there is no single pooled "OOS series" the way there is for a
    trade-level result, since each fold's score is already an aggregate over
    that fold's days."""
    specs, fold_rows = [], []
    for i, (tr_start, split, te_end) in enumerate(fold_bounds(frame["date"], n_folds)):
        train = frame[(frame["date"] >= tr_start) & (frame["date"] < split)]
        test = frame[(frame["date"] >= split) & (frame["date"] < te_end)]
        if len(train) < 200 or len(test) < 30:
            continue
        spec = design_vol(train)
        spec.fold = i
        oos = apply_vol_spec(spec, test)
        fold_rows.append(dict(fold=i, train_end=str(split), test_end=str(te_end),
                              estimator=spec.estimator, width_source=spec.width_source,
                              train_combined_hl_pinball=spec.train_stat.get("combined_hl_pinball"),
                              oos=oos))
        specs.append(spec)
        if verbose:
            o = oos or {}
            print(f"  fold {i}: train→{split:%Y-%m-%d} | best train spec "
                  f"{spec.estimator}+{spec.width_source} "
                  f"(train loss={spec.train_stat.get('combined_hl_pinball', float('nan')):.4f}) "
                  f"| OOS n={o.get('n', 0)} combined_hl_pinball={o.get('combined_hl_pinball', float('nan')):.4f} "
                  f"exceed_hl50={o.get('exceed_hl_p50', float('nan')):.2f} "
                  f"exceed_hl75={o.get('exceed_hl_p75', float('nan')):.2f}", flush=True)
    return {"folds": fold_rows, "specs": [s.to_dict() for s in specs]}


def load_daily(pair: str, data_root: str = "VolRangeForecaster/data/m1",
              day_start_hour: int = 0, years: float = 0) -> pd.DataFrame:
    """Convenience loader matching the rest of `forge`'s data path: M1 ->
    causal D1 OHLC for one instrument."""
    m1 = load_m1(pair, data_root)
    if years:
        cutoff = m1.index[-1] - pd.Timedelta(days=365.25 * years)
        m1 = m1[m1.index >= cutoff]
    return resample(m1, "d1")


# Indices have real 10-year M1 data too, just cached under a different root
# (`portfolioBacktest/cache/`, built for an unrelated portfolio study) rather
# than `VolRangeForecaster/data/m1/`. `INDEX_DATA_ROOT` and `INDEX_PAIRS`
# exist so a caller can reach them without hardcoding the second path
# everywhere index coverage is needed — found by checking, not assumed: the
# FX+gold-only universe in `xsect.discover_universe` only globs the one root,
# so indices were silently invisible to `forge` until this was added.
INDEX_DATA_ROOT = "portfolioBacktest/cache"
INDEX_PAIRS = ("nq", "spx500", "de30", "uk100")


def discover_full_universe(fx_root: str = "VolRangeForecaster/data/m1",
                           index_root: str = INDEX_DATA_ROOT) -> dict[str, str]:
    """Every instrument this module can honestly forecast, mapped to the data
    root that holds it: the 25 FX pairs + gold from `fx_root`, plus
    NQ/SPX500/DE30(DAX)/UK100(FTSE) from `index_root`. `portfolioBacktest/
    cache/` also happens to hold a few FX pairs (its own dependency, not
    index-specific) — `fx_root`'s copy wins for those, so every FX pair is
    still read from the same place every other `forge` module uses, and only
    the genuinely index-only names are added from the second root.
    """
    from pathlib import Path
    universe = {p: fx_root for p in discover_universe_fx(fx_root)}
    for p in INDEX_PAIRS:
        if (Path(index_root) / f"{p}_m1.parquet").exists():
            universe[p] = index_root
    return universe


def discover_universe_fx(data_root: str = "VolRangeForecaster/data/m1") -> list[str]:
    """Same as `xsect.discover_universe` — duplicated rather than imported to
    keep `vol.py` important-question modules importable without pulling in
    `xsect`'s cross-sectional machinery for something this small."""
    from pathlib import Path
    return sorted(p.stem.removesuffix("_m1") for p in Path(data_root).glob("*_m1.parquet"))


# ── per-day OOS reconstruction — what actually gets exported for verification ─

def oos_predictions(frame: pd.DataFrame, n_folds: int = 6) -> pd.DataFrame:
    """Every OOS day's forecast (from that fold's frozen, train-only spec)
    alongside what actually happened — the day-by-day evidence behind the
    aggregate calibration numbers `walk_forward_vol` reports, and the thing
    to hand someone who wants to "see the output to verify" rather than take
    a summary statistic's word for it.

    Days in the first ~40% of history (the initial training window, before
    any fold has a frozen spec to score OOS with) are NOT included — there
    is no OOS forecast for them, and padding them with an in-sample number
    would defeat the entire point of a verification export.
    """
    rows = []
    for i, (tr_start, split, te_end) in enumerate(fold_bounds(frame["date"], n_folds)):
        train = frame[(frame["date"] >= tr_start) & (frame["date"] < split)]
        test = frame[(frame["date"] >= split) & (frame["date"] < te_end)]
        if len(train) < 200 or len(test) < 1:
            continue
        spec = design_vol(train)
        sigma = test[f"sigma_{spec.estimator}"].to_numpy()
        pred = predicted_quantiles(sigma, spec.width_mult)
        rows.append(pd.DataFrame({
            "date": test["date"].to_numpy(), "fold": i,
            "estimator": spec.estimator, "width_source": spec.width_source,
            "sigma_annual_pct": sigma,
            "hl_p50": pred["hl_p50"], "hl_p75": pred["hl_p75"],
            "oc_p50": pred["oc_p50"], "oc_p75": pred["oc_p75"],
            "realized_hl_pct": test["hl_pct"].to_numpy(),
            "realized_oc_pct": test["oc_pct"].to_numpy(),
        }))
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True).dropna(subset=["hl_p50"])
