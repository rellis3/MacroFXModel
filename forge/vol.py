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
# The four original slots are the values this repo has always used, kept BIT-FOR-BIT
# so the `feller` arm remains the same control it was in the first run. They are not
# actually the quantiles they are named after. Verified by Monte Carlo (400k paths x
# 4000 steps, Broadie-Glasserman-Kou continuity correction; E[R] reproduces the known
# sqrt(8/pi)=1.5958 to 4 decimal places):
#     true BM range quantiles      P50 1.5135  P75 1.8599  P90 2.2374
#     BM_P50=1.572 actually sits at the 55th percentile, BM_P75=2.049 at the 84th
#     true half-normal quantiles   P50 0.6745  P75 1.1503  P90 1.6449
#     HN_P50=0.7979 is E|N| (the MEAN, 57th pct), HN_P75=1.284 sits at the 80th
# So theory alone accounts for ~4% of the median band's width error and ~10% of the
# 75th's — real but a small share of the 30-55% total, i.e. most of the gap is that
# real ranges run narrower against sigma than driftless BM implies, not the constant.
# The NEW slots below use the correct theoretical quantiles, and the `fit` arm
# replaces all twelve with realized-fit multipliers — that is what production ships.
FELLER = {
    "BM_P50": 1.572, "BM_P75": 2.049, "BM_P90": 2.2374,
    "HN_P50": 0.7979, "HN_P75": 1.284, "HN_P90": 1.6449,
    # O-H / O-L: the running max of a driftless BM is half-normal (reflection
    # principle), so the one-sided slots start from the half-normal quantiles.
    "OH_P50": 0.6745, "OH_P75": 1.1503, "OH_P90": 1.6449,
    "OL_P50": 0.6745, "OL_P75": 1.1503, "OL_P90": 1.6449,
}
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
    d = sigma_annual_pct / SQRT252
    out = {}
    for slot, key in (("BM", "hl"), ("HN", "oc"), ("OH", "oh"), ("OL", "ol")):
        for q in ("p50", "p75", "p90"):
            name = f"{slot}_{q.upper()}"
            if name in c:
                out[f"{key}_{q}"] = c[name] * d
    return out


def realized_quantities(daily: pd.DataFrame) -> dict:
    """Actual daily High-Low and |Open-Close| as % of that day's open —
    what each `predicted_quantiles` line is trying to forecast."""
    o, h, l, c = (daily[col].to_numpy(dtype=float) for col in ("open", "high", "low", "close"))
    return {
        "hl_pct": (h - l) / o * 100.0,
        "oc_pct": np.abs(c - o) / o * 100.0,
        # One-sided excursions from the open — the levels the forecaster draws as
        # O-H / O-L and the ones that actually get faded. Measured separately (not
        # inferred from O-C by the reflection principle) because real days have
        # drift, so the up-excursion and down-excursion are NOT the same variable.
        "oh_pct": (h - o) / o * 100.0,
        "ol_pct": (o - l) / o * 100.0,
    }


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


# ── scheduled-event conditioning ───────────────────────────────────────────
#
# The single largest conditioning variable found in this system. Measured across
# 52,587 OOS pair-days of this module's own output: a forecast calibrated to 50%
# exceedance unconditionally runs at 40-45% on days with no US Major release and
# 62-76% on event days — a ~30 percentage-point swing that no width constant can
# absorb, because it is a property of the DAY, not of the instrument.
#
# Two things this deliberately does differently from the incumbent
# `detectNewsMultiplier` in js/volForecast.js:
#   * It is TWO-SIDED. Quiet days need ~0.90, and roughly half the calendar is
#     quiet. The incumbent starts at 1.0 and can only ratchet up, so it has no way
#     to express the most common case.
#   * The generic bucket is not empty. ~22% of days carry a US Major release that
#     is not CPI/NFP/FOMC (Retail Sales, Durable Goods, ISM, JOLTs, ...). Those run
#     ~1.13 and the incumbent's seven regexes give them 1.00.
#
# Fit on TRAIN only and frozen, exactly like the width multipliers, and shrunk
# toward 1.0 by sample size so a thin bucket cannot swing the forecast.
# Six buckets. The three named US releases move EVERY instrument, so they keep their
# own; below them the day is graded by ForexFactory's own impact rating within the
# instrument's OWN currencies — which is what fixes the AUD case, where two
# high-impact AU releases were tagged quiet and DISCOUNTED because the tagger only
# ever looked at USD.
#
# `none` means the calendar was read and the day is genuinely quiet. A date the
# calendar does not COVER is not `none` — it is unknown, gets no tag, and is excluded
# from the fit. Collapsing the two would pour real event days into the quiet bucket
# and drag its multiplier toward 1.0, quietly destroying the effect being measured.
EVENT_TAGS = ("FOMC", "NFP", "CPI", "high", "holiday", "none")
_EVENT_RANK = {"FOMC": 6, "NFP": 5, "CPI": 4, "high": 3, "holiday": 2, "none": 1}
# Safety rail. A fitted multiplier outside this range is not a market fact, it is a
# bucket that has quietly become a proxy for something else — which is exactly what
# happened when a `medium` bucket left `none` measuring public holidays and fitting
# at 0.43. Clamping means the worst case is an under-correction, never a halved band.
EVENT_MULT_CLAMP = (0.55, 1.60)
# The floor is 0.55 rather than 0.80 only because `holiday` is now its own bucket: a
# thin session genuinely runs at roughly half range, and clamping that to 0.80 would
# under-correct a real effect. Before holidays were separated, the floor was doing
# load-bearing work hiding a mis-specified bucket — which is not what a safety rail
# is for.
EVENT_SHRINK_K = 50          # a bucket with n=50 lands halfway between 1.0 and its raw fit


def load_event_tags(csv_path: str = "calendar_events.csv", ccy: str = "USD") -> dict:
    """date (YYYY-MM-DD) -> the highest-ranked scheduled event on that day.

    Only `Major` impact rows count. A day with several releases takes the
    highest-ranked one (FOMC > NFP > CPI > other) rather than compounding them —
    the multiplier is a statement about the day, and the days that carry an FOMC
    *and* a Retail Sales print are not measurably bigger than FOMC alone.
    """
    import csv as _csv
    tags: dict[str, str] = {}
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in _csv.DictReader(fh):
            if row.get("impact") != "Major" or row.get("ccy") != ccy:
                continue
            ev = row.get("event") or ""
            low = ev.lower()
            if "fed press conference" in low or "fomc" in low or "interest rate decision" in low:
                tag = "FOMC"
            elif "payroll jobs growth" in low:
                tag = "NFP"
            elif "inflation rate" in low:
                tag = "CPI"
            else:
                # The legacy CSV's generic "Major" maps onto the same `high` bucket the
                # ForexFactory arm uses, so a control run isolates the calendar SOURCE
                # rather than confounding it with a taxonomy change.
                tag = "high"
            d = row.get("date") or ""
            if _EVENT_RANK[tag] > _EVENT_RANK.get(tags.get(d, ""), 0):
                tags[d] = tag
    return tags


def tag_column(dates, tags: dict, covered: tuple | None = None) -> np.ndarray:
    """Event tag per row. Dates OUTSIDE the calendar's coverage window get None (not
    'none') so they can be excluded from the fit — see the EVENT_TAGS note above."""
    idx = pd.DatetimeIndex(dates)
    lo, hi = (pd.Timestamp(covered[0]), pd.Timestamp(covered[1])) if covered else (None, None)
    out = []
    for d in idx:
        dd = pd.Timestamp(d).tz_localize(None) if pd.Timestamp(d).tzinfo else pd.Timestamp(d)
        if lo is not None and (dd < lo or dd > hi):
            out.append(None)
        else:
            out.append(tags.get(d.strftime("%Y-%m-%d"), "none"))
    return np.array(out, dtype=object)


def fit_event_multipliers(frame: pd.DataFrame, estimator: str,
                          shrink_k: int = EVENT_SHRINK_K) -> dict:
    """Per-tag sigma multiplier fit on TRAIN: the median ratio of realized H-L to
    the width-fitted H-L median for that bucket. Scaling sigma (rather than one
    rung) is what the data supports — scaling by the p50 ratio lands p50 at 50.0%
    and leaves p75 at 20-28% against its 25% target, i.e. event days are shifted
    more than they are fattened.
    """
    if "event_tag" not in frame:
        return {}
    daily_sigma = frame[f"sigma_{estimator}"].to_numpy() / SQRT252
    hl = frame["hl_pct"].to_numpy()
    base = fit_width_multiplier(daily_sigma, hl, 0.50)
    if not np.isfinite(base):
        return {}
    pred = base * daily_sigma
    ratio = np.where(pred > 0, hl / pred, np.nan)
    tagcol = frame["event_tag"].to_numpy()
    out = {}
    for tag in EVENT_TAGS:
        sel = (tagcol == tag) & np.isfinite(ratio)      # None-tagged rows match nothing
        n = int(sel.sum())
        if n < 10:
            continue
        raw = float(np.nanmedian(ratio[sel]))
        # shrink toward 1.0 by sample size, then clamp
        m = 1.0 + (raw - 1.0) * n / (n + shrink_k)
        out[tag] = float(np.clip(m, *EVENT_MULT_CLAMP))
    return out


def event_multiplier_vector(frame: pd.DataFrame, event_mult: dict) -> np.ndarray:
    """Per-row sigma multiplier from a frozen event-multiplier map (1.0 where the
    tag is unknown or wasn't fit)."""
    if not event_mult or "event_tag" not in frame:
        return np.ones(len(frame))
    tagcol = frame["event_tag"].to_numpy()
    return np.array([event_mult.get(t, 1.0) for t in tagcol], dtype=float)


# ── panel + walk-forward: which estimator, which width source, wins OOS ────

def build_forecast_frame(daily: pd.DataFrame, event_tags: dict | None = None) -> pd.DataFrame:
    # `event_tags` is either a plain {date: tag} map or {"tags": {...}, "covered": (lo, hi)}.
    """One row per day: every estimator's FORECAST-READY sigma (`as_of_
    yesterday` applied uniformly) alongside that day's realized HL/OC.
    `ESTIMATORS["naive"]` sits in this same frame and competes in the same
    grid as every adaptive estimator — not a separately hard-coded
    benchmark — so the walk-forward selection can honestly choose it if nothing
    faster earns its keep OOS."""
    realized = realized_quantities(daily)
    out = pd.DataFrame({"date": daily.index, "hl_pct": realized["hl_pct"],
                        "oc_pct": realized["oc_pct"], "oh_pct": realized["oh_pct"],
                        "ol_pct": realized["ol_pct"]})
    for name, fn in ESTIMATORS.items():
        out[f"sigma_{name}"] = as_of_yesterday(fn(daily))
    if event_tags:
        tags = event_tags.get("tags", event_tags) if isinstance(event_tags, dict) and "tags" in event_tags else event_tags
        covered = event_tags.get("covered") if isinstance(event_tags, dict) else None
        out["event_tag"] = tag_column(out["date"], tags, covered)
    return out.dropna(subset=["hl_pct", "oc_pct"]).reset_index(drop=True)


WIDTH_SOURCES = ("feller", "fit")
QUANTILE_TARGETS = (("hl_pct", "hl_p50", 0.50), ("hl_pct", "hl_p75", 0.75))
# Selection is on HIGH-LOW only (median + 75th) — the quantity a stop/target
# distance is actually sized from. Open-Close is still scored and reported
# for the frozen winner, as a secondary diagnostic, not a selection criterion
# — folding a third and fourth target into the same score would let a spec
# "win" by being mediocre at everything instead of good at the one thing
# that matters most for sizing.
# Every rung is SCORED (so the frozen winner reports honest calibration for the
# whole ladder); only QUANTILE_TARGETS above drives SELECTION. p90 and the one-sided
# O-H / O-L rungs join as scored targets — the exhaustion levels the page actually
# draws — without being allowed to sway which estimator wins.
ALL_TARGETS = tuple(
    (f"{q}_pct", f"{q}_{p}", tau)
    for q in ("hl", "oc", "oh", "ol")
    for p, tau in (("p50", 0.50), ("p75", 0.75), ("p90", 0.90))
)


def _fit_multiplier_set(frame: pd.DataFrame, estimator: str) -> dict:
    """Fit all four Feller-slot multipliers from TRAIN data for one
    estimator — the "correct width" half of the repo's own prescription,
    calibrated to REALIZED range, never to COG's or Feller's constant."""
    daily_sigma = frame[f"sigma_{estimator}"].to_numpy() / SQRT252
    out = {}
    for slot, col in (("BM", "hl_pct"), ("HN", "oc_pct"), ("OH", "oh_pct"), ("OL", "ol_pct")):
        if col not in frame:
            continue
        actual = frame[col].to_numpy()
        for q, tau in (("P50", 0.50), ("P75", 0.75), ("P90", 0.90)):
            out[f"{slot}_{q}"] = fit_width_multiplier(daily_sigma, actual, tau)
    return out


def _score(frame: pd.DataFrame, estimator: str, width_mult: dict, min_n: int = 60,
           sigma_mult: np.ndarray | None = None) -> dict | None:
    """Combined HL pinball loss (the selection score) + full per-target
    breakdown + exceed-rates, for one frozen (estimator, width_mult) spec on
    `frame`. Returns None if there isn't enough finite data to score."""
    sigma = frame[f"sigma_{estimator}"].to_numpy()
    if sigma_mult is not None:
        sigma = sigma * sigma_mult
    pred = predicted_quantiles(sigma, width_mult)
    ok = np.isfinite(sigma)
    n = int(ok.sum())
    if n < min_n:
        return None

    detail = {}
    hl_losses = []
    for col, key, tau in ALL_TARGETS:
        if key not in pred or col not in frame:
            continue          # rung this spec has no fitted multiplier for
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
    event_mult: dict = field(default_factory=dict)

    def describe(self) -> str:
        src = "Feller theoretical constants" if self.width_source == "feller" else \
              "realized-range-fit multipliers (train-only)"
        return (f"{self.estimator} sigma x {src} "
                f"| train combined HL pinball={self.train_stat.get('combined_hl_pinball', float('nan')):.4f}")

    def to_dict(self) -> dict:
        return {"estimator": self.estimator, "width_source": self.width_source,
                "width_mult": self.width_mult, "event_mult": self.event_mult, "fold": self.fold,
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
            # Only the SELECTION slots must be finite — a NaN in a scored-only rung
            # (e.g. too few finite O-L observations) drops that rung, not the spec.
            if any(not np.isfinite(mult.get(k, float("nan"))) for k in ("BM_P50", "BM_P75")):
                continue
            mult = {k: v for k, v in mult.items() if np.isfinite(v)}
            s = _score(train, est, mult)
            if s is None:
                continue
            candidates.append({"estimator": est, "width_source": src, "width_mult": mult, **s})
    n_hyp = len(estimators) * len(WIDTH_SOURCES)
    if not candidates:
        return VolSpec(estimators[0], "feller", FELLER, "", n_hyp,
                       train_stat={"combined_hl_pinball": float("nan"), "n": 0})
    best = min(candidates, key=lambda c: c["combined_hl_pinball"])
    # The event layer is fit AFTER selection, on the winner only: it is a property
    # of the calendar, not a competing hypothesis, so letting it into the selection
    # grid would just multiply the hypothesis count without changing the ranking.
    ev = fit_event_multipliers(train, best["estimator"])
    return VolSpec(best["estimator"], best["width_source"], best["width_mult"],
                   str(train["date"].max()), n_hyp, train_stat=best, event_mult=ev)


def apply_vol_spec(spec: VolSpec, test: pd.DataFrame) -> dict | None:
    """The frozen spec's realized calibration on unseen data."""
    return _score(test, spec.estimator, spec.width_mult,
                  sigma_mult=event_multiplier_vector(test, spec.event_mult))


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
              day_start_hour: int = 0, years: float = 0, end: str | None = None) -> pd.DataFrame:
    """Convenience loader matching the rest of `forge`'s data path: M1 ->
    causal D1 OHLC for one instrument.

    `end` truncates the series. Its purpose is the event layer: the historical
    calendar stops before the price data does, and scoring a fold whose test window
    has NO calendar silently measures the forecast with the event multiplier switched
    off — which looks like a calibration result and isn't one.
    """
    m1 = load_m1(pair, data_root)
    if end:
        m1 = m1[m1.index <= pd.Timestamp(end, tz="UTC")]
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
INDEX_PAIRS = ("nq", "spx500", "de30", "uk100", "us30", "us2000")

# forge pair key -> the name the live forecaster publishes it under. Needed here (not
# just in the exporter) so the event layer can look up which CURRENCIES move a given
# instrument while fitting.
NAME_FOR_PAIR = {"gold": "GOLD", "nq": "NQ", "spx500": "SPX500", "de30": "DE30",
                 "uk100": "UK100", "us30": "US30", "us2000": "US2000"}

# The FX root also holds index M1 under SHORT aliases (dow=us30, spx=spx500, nq),
# written in the RangeIndex+`time` layout. They duplicate `INDEX_PAIRS` under names
# the forecaster doesn't use, so the index root's copies win and these are skipped —
# otherwise the same instrument would be fit twice under two names.
FX_ROOT_SKIP = frozenset({"dow", "spx", "nq", "gold.bak"})


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
    universe = {p: fx_root for p in discover_universe_fx(fx_root) if p not in FX_ROOT_SKIP}
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


# ── multi-horizon widths ───────────────────────────────────────────────────
#
# The weekly and monthly exports do NOT get their own volatility estimator. They
# reuse the daily sigma scaled by sqrt-time, exactly as the page has always done
# (weekly = daily x sqrt5, monthly = daily x sqrt20) — what gets refit per horizon
# is the WIDTH, because sqrt-time scaling of sigma is not the same claim as
# sqrt-time scaling of a RANGE quantile. Volatility mean-reverts inside a week, so
# a week's range is reliably narrower than five independent days would imply, and
# fitting the multiplier is what absorbs that.
#
# Sample sizes are honest here rather than inflated: WEEKLY uses non-overlapping
# calendar weeks (~520 in ten years). MONTHLY uses OVERLAPPING 20-trading-day
# windows, because non-overlapping months give only ~120 observations — far too few
# for a stable p90. Overlapping windows leave the quantile estimate unbiased but
# heavily autocorrelated, so the effective sample is much smaller than the raw
# count; `n_effective` reports the non-overlapping equivalent, and the monthly rungs
# should be read as the least certain part of the ladder.
HORIZON_DAYS = {"weekly": 5, "monthly": 20}


def horizon_windows(frame: pd.DataFrame, horizon: str, overlapping: bool | None = None):
    """(sigma_forecast, realized dict) pairs for one horizon.

    The sigma is the DAILY forecast-ready sigma at the window's first day, scaled by
    sqrt(window length) — the identical quantity production will feed the ladder.
    """
    span = HORIZON_DAYS[horizon]
    if overlapping is None:
        overlapping = horizon == "monthly"
    step = 1 if overlapping else span
    return span, step


def fit_horizon_widths(daily: pd.DataFrame, frame: pd.DataFrame, estimator: str,
                       horizon: str, train_end=None) -> dict:
    """Width multipliers for `horizon`, fit on rows strictly before `train_end`.

    `daily` supplies the OHLC to aggregate into windows; `frame` supplies the
    forecast-ready daily sigma per day (already `as_of_yesterday`-shifted).
    """
    span, step = horizon_windows(frame, horizon)
    sig_col = f"sigma_{estimator}"
    if sig_col not in frame:
        return {}
    dates = pd.DatetimeIndex(frame["date"])
    sig = frame[sig_col].to_numpy() / SQRT252          # daily sigma, % of price
    o = daily["open"].to_numpy(dtype=float)
    h = daily["high"].to_numpy(dtype=float)
    l = daily["low"].to_numpy(dtype=float)
    c = daily["close"].to_numpy(dtype=float)
    # frame rows are a subset of daily rows (dropna); align by date
    pos = {d: i for i, d in enumerate(pd.DatetimeIndex(daily.index))}
    idx = np.array([pos.get(d, -1) for d in dates])

    rows = {"hl_pct": [], "oc_pct": [], "oh_pct": [], "ol_pct": [], "sig": []}
    n = len(frame)
    for start in range(0, n - span + 1, step):
        i0 = idx[start]
        i1 = idx[min(start + span - 1, n - 1)]
        if i0 < 0 or i1 < i0:
            continue
        if train_end is not None and dates[start] >= train_end:
            break
        s = sig[start]
        if not np.isfinite(s) or s <= 0:
            continue
        op = o[i0]
        hi = h[i0:i1 + 1].max()
        lo = l[i0:i1 + 1].min()
        cl = c[i1]
        if not np.isfinite(op) or op <= 0:
            continue
        rows["hl_pct"].append((hi - lo) / op * 100.0)
        rows["oc_pct"].append(abs(cl - op) / op * 100.0)
        rows["oh_pct"].append((hi - op) / op * 100.0)
        rows["ol_pct"].append((op - lo) / op * 100.0)
        rows["sig"].append(s * np.sqrt(span))          # sqrt-time scaled, as production does

    sig_arr = np.asarray(rows["sig"], dtype=float)
    if len(sig_arr) < 60:
        return {}
    out = {}
    for col, slot in (("hl_pct", "BM"), ("oc_pct", "HN"), ("oh_pct", "OH"), ("ol_pct", "OL")):
        actual = np.asarray(rows[col], dtype=float)
        for q, tau in (("P50", 0.50), ("P75", 0.75), ("P90", 0.90)):
            out[f"{slot}_{q}"] = fit_width_multiplier(sig_arr, actual, tau)
    out["_n"] = int(len(sig_arr))
    out["_n_effective"] = int(len(sig_arr) / (span if step == 1 else 1))
    out["_overlapping"] = step == 1
    return out


def score_horizon(daily: pd.DataFrame, frame: pd.DataFrame, estimator: str, horizon: str,
                  width: dict, test_start=None) -> dict:
    """Exceedance of each horizon rung on rows at/after `test_start` — the OOS check
    for a frozen horizon width set."""
    span, step = horizon_windows(frame, horizon)
    sig_col = f"sigma_{estimator}"
    dates = pd.DatetimeIndex(frame["date"])
    sig = frame[sig_col].to_numpy() / SQRT252
    o = daily["open"].to_numpy(dtype=float); h = daily["high"].to_numpy(dtype=float)
    l = daily["low"].to_numpy(dtype=float);  c = daily["close"].to_numpy(dtype=float)
    pos = {d: i for i, d in enumerate(pd.DatetimeIndex(daily.index))}
    idx = np.array([pos.get(d, -1) for d in dates])
    hits = {}
    n = len(frame)
    for start in range(0, n - span + 1, step):
        if test_start is not None and dates[start] < test_start:
            continue
        i0, i1 = idx[start], idx[min(start + span - 1, n - 1)]
        if i0 < 0 or i1 < i0:
            continue
        s = sig[start]
        if not np.isfinite(s) or s <= 0:
            continue
        op = o[i0]
        real = {"BM": (h[i0:i1 + 1].max() - l[i0:i1 + 1].min()) / op * 100.0,
                "HN": abs(c[i1] - op) / op * 100.0,
                "OH": (h[i0:i1 + 1].max() - op) / op * 100.0,
                "OL": (op - l[i0:i1 + 1].min()) / op * 100.0}
        ss = s * np.sqrt(span)
        for slot, actual in real.items():
            for q in ("P50", "P75", "P90"):
                mult = width.get(f"{slot}_{q}")
                if mult is None or not np.isfinite(mult):
                    continue
                key = f"{slot}_{q}"
                hits.setdefault(key, [0, 0])
                hits[key][1] += 1
                if actual > mult * ss:
                    hits[key][0] += 1
    return {k: round(v[0] / v[1], 4) for k, v in hits.items() if v[1]}


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
        sigma = test[f"sigma_{spec.estimator}"].to_numpy() * event_multiplier_vector(test, spec.event_mult)
        pred = predicted_quantiles(sigma, spec.width_mult)
        cols = {
            "date": test["date"].to_numpy(), "fold": i,
            "estimator": spec.estimator, "width_source": spec.width_source,
            "sigma_annual_pct": sigma,
        }
        if "event_tag" in test:
            cols["event_tag"] = test["event_tag"].to_numpy()
        cols.update({k: v for k, v in pred.items()})          # all twelve rungs
        for q in ("hl", "oc", "oh", "ol"):
            if f"{q}_pct" in test:
                cols[f"realized_{q}_pct"] = test[f"{q}_pct"].to_numpy()
        rows.append(pd.DataFrame(cols))
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True).dropna(subset=["hl_p50"])
