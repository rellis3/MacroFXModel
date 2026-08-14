"""residual — is a pair's price out of line with what the whole FX cross-rate
network says it should be, and does that gap mean-revert enough to trade net
of cost?

WHY A NETWORK, NOT A PAIR-VS-PAIR SPREAD
─────────────────────────────────────────
Two single-relationship approaches were tried and both failed for identifiable
reasons:

  1. Single-instrument residual (price minus its own moving average) was
     stationary with a short half-life, but fading it lost to buy-and-hold on
     NAS and gold — the residual still carries the asset's own drift, so
     fading it is a bet against the trend, and the trend wins.

  2. A two-asset relative-value spread (NAS vs an S&P-based fair value) with a
     ROLLING hedge ratio looked clean (stationary, ~27-day half-life) but lost
     money even before costs. The rolling beta re-anchors fair value to
     wherever price has recently been, which manufactures apparent
     stationarity — the hedge ratio is doing the reverting, not the market.
     A FIXED beta showed the truth: the spread drifts ~+85% over the sample
     (secular tech-vs-broad-market outperformance). NQ and ES are not
     genuinely cointegrated.

The fix for both failure modes at once is a basket, not a pair, with an
anchor that is structural rather than fitted:

  * G10 FX is close to ideal for this because the 26-pair universe is NOT 26
    independent prices — it is ~8 currencies (AUD, CAD, CHF, EUR, GBP, JPY,
    NZD, USD) observed through 25 overlapping cross rates (gold has no
    base/quote currency and is excluded from the network). That redundancy
    is the arbitrage-linked structure a real stat-arb edge needs (the same
    role a futures basis or calendar spread plays for other asset classes),
    and unlike a rolling beta it requires NO free parameter: each pair's
    return is decomposed as (base currency strength − quote currency
    strength) + residual via one least-squares solve PER DAY, using only
    that day's cross-section of returns. Nothing rolls, nothing chases price
    — the "hedge ratio" here is the incidence structure of the currency
    graph itself, fixed by which pairs exist, never re-estimated from price
    history.

  * The residual left over each day is genuinely market-neutral (it is what
    is NOT explained by common currency moves), unlike approach #1's
    single-asset residual which still contains that asset's own drift.

  * Trading it CROSS-SECTIONALLY (long the most negative residual z-scores,
    short the most positive, across many pairs) diversifies away the risk
    that any single relationship — like NQ/ES — turns out not to be
    cointegrated after all. One broken pair does not sink the book.

WHAT THIS MODULE DOES NOT CLAIM
─────────────────────────────────
This is the go/no-go diagnostic, not the structural system. It answers: does
the currency-network residual mean-revert (ADF, half-life), and does trading
that reversion cross-sectionally survive costs, out-of-sample, against a
shuffled-score null? A green light here is the START of a multi-week build
(execution, sizing, risk guard, live decomposition) — the same discipline as
`forge/xsect.py`'s walk-forward before any bot gets written.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from pylego.costs import default_spread

from forge.bars import frame, load_m1
from forge.xsect import discover_universe

try:
    from statsmodels.tsa.stattools import adfuller as _adfuller
    _HAS_STATSMODELS = True
except ImportError:                                             # pragma: no cover
    _HAS_STATSMODELS = False

DEFAULT_K_GRID = (3, 5)
DEFAULT_H_GRID = (1, 5, 10)
DEFAULT_SIGN_GRID = ("reversion", "momentum")


def fx_universe(data_root: str = "VolRangeForecaster/data/m1") -> list[str]:
    """Every pair with local M1 data EXCLUDING gold — gold has no base/quote
    currency pair and does not belong in the currency-network incidence
    matrix (it could be added back later as its own pseudo-currency vs USD,
    but that is a deliberate follow-on choice, not this diagnostic's job)."""
    return [p for p in discover_universe(data_root) if p != "gold"]


def split_pair(pair: str) -> tuple[str, str]:
    return pair[:3].upper(), pair[3:].upper()


def currency_network(pairs: list[str]) -> tuple[list[str], np.ndarray]:
    """The fixed incidence matrix A (n_pairs x n_currencies): +1 in the base
    currency's column, -1 in the quote's. A pair's return is modeled as
    A @ x = base_strength - quote_strength; solving for x is what turns a
    cross-section of pair returns into per-currency strength moves.

    This matrix never changes across dates — it is determined entirely by
    which pairs exist, not by any fitted/rolling parameter. That is the
    property the rolling-hedge-ratio spread (see module docstring) lacked."""
    currencies = sorted({c for p in pairs for c in split_pair(p)})
    idx = {c: i for i, c in enumerate(currencies)}
    A = np.zeros((len(pairs), len(currencies)))
    for i, p in enumerate(pairs):
        b, q = split_pair(p)
        A[i, idx[b]] += 1.0
        A[i, idx[q]] -= 1.0
    return currencies, A


def load_daily_closes(pairs: list[str], data_root: str = "VolRangeForecaster/data/m1",
                      day_start_hour: int = 0, years: float = 0) -> pd.DataFrame:
    """Wide date x pair frame of daily close prices, outer-joined across the
    universe. A pair with no data in the window (e.g. `audchf`, whose local
    parquet stops in 2020 — see `forge.xsect.build_panel`'s docstring for the
    same trap) simply has NaN there rather than truncating everyone else;
    each date's currency-network solve below uses only the pairs actually
    present that day.

    `years`, like `xsect.build_panel`, is measured back from the single
    latest last-bar across the whole universe, not each pair's own last bar.
    """
    last_bars = {p: load_m1(p, data_root).index[-1] for p in pairs}
    reference = max(last_bars.values())
    cutoff = reference - pd.Timedelta(days=365.25 * years) if years else None

    cols = {}
    for p in pairs:
        m1 = load_m1(p, data_root)
        if cutoff is not None:
            m1 = m1[m1.index >= cutoff]
            if m1.empty:
                continue
        bars = frame(m1, "d1", day_start_hour=day_start_hour)
        cols[p] = pd.Series(bars["close"].to_numpy(), index=bars.index.normalize())
        del m1
    return pd.DataFrame(cols).sort_index()


def decompose(returns: pd.DataFrame, pairs: list[str], currencies: list[str],
             A: np.ndarray) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Per-date least-squares solve: for each date, regress that day's
    observed pair returns on the (fixed) currency incidence matrix, using
    only the pairs with data that day. Returns:

      resid  — date x pair, the part of each pair's return NOT explained by
               common currency strength moves (the idiosyncratic / mispricing
               return, market-neutral by construction).
      ccy    — date x currency, the fitted currency strength moves.

    A date needs at least `len(currencies) - 1` valid pairs to identify the
    network at all (fewer than that and the system is under-determined even
    before considering connectivity); it is skipped (left NaN) otherwise.
    `np.linalg.lstsq` returns the minimum-norm solution for the always-present
    one-dimensional null space (currency strengths are only defined up to a
    shared additive constant — a common shock to every currency is invisible
    to relative pair prices), which is equivalent to normalizing so the
    active currencies' strengths sum to zero.
    """
    pair_pos = {p: i for i, p in enumerate(pairs)}
    resid = pd.DataFrame(index=returns.index, columns=pairs, dtype=float)
    ccy = pd.DataFrame(index=returns.index, columns=currencies, dtype=float)
    for date, row in returns.iterrows():
        valid = row.dropna()
        if len(valid) < len(currencies) - 1:
            continue
        rows_idx = [pair_pos[p] for p in valid.index]
        A_sub = A[rows_idx]
        y = valid.to_numpy()
        x, *_ = np.linalg.lstsq(A_sub, y, rcond=None)
        fitted = A_sub @ x
        resid.loc[date, valid.index] = y - fitted
        active = A_sub.any(axis=0)
        ccy.loc[date, np.array(currencies)[active]] = x[active]
    return resid, ccy


def residual_levels(resid: pd.DataFrame) -> pd.DataFrame:
    """Cumulative idiosyncratic return per pair — the tradable quantity: in
    log-price terms, this equals actual price minus the currency-network's
    fair value (up to an arbitrary per-pair constant, which does not matter
    for z-scoring against the series' own history). NaN before a pair's first
    valid observation; a day with no observation (data gap) is treated as "no
    new information" (contributes 0), not as reversion or drift."""
    mask = resid.notna()
    cum = resid.fillna(0.0).cumsum()
    return cum.where(mask.cummax(), np.nan)


def adf_test(series: pd.Series) -> dict:
    """Augmented Dickey-Fuller stationarity test (statsmodels, AIC lag
    selection) with a plain-regression fallback if statsmodels is absent —
    the same optional-dependency guard `portfolioBacktest/portfolio_backtest.py`
    uses for `coint`. The fallback has no lag augmentation and no exact
    p-value; it reports the Dickey-Fuller t-stat against the commonly cited
    ~-2.86 5% critical value (constant, no trend, large n) instead."""
    s = series.dropna()
    if len(s) < 30:
        return {"n": len(s), "stat": float("nan"), "pvalue": float("nan"), "method": "insufficient_data"}
    if _HAS_STATSMODELS:
        stat, pvalue = _adfuller(s.to_numpy(), autolag="AIC")[:2]
        return {"n": len(s), "stat": float(stat), "pvalue": float(pvalue), "method": "adfuller"}
    y = s.to_numpy()
    dy, y_lag = np.diff(y), y[:-1]
    X = np.column_stack([np.ones_like(y_lag), y_lag])
    beta, *_ = np.linalg.lstsq(X, dy, rcond=None)
    e = dy - X @ beta
    dof = len(dy) - 2
    se_b = float(np.sqrt((e @ e) / dof * np.linalg.inv(X.T @ X)[1, 1]))
    return {"n": len(s), "stat": float(beta[1] / se_b), "pvalue": float("nan"),
           "method": "plain_df_approx (5% crit ~-2.86, no lag augmentation)"}


def half_life(series: pd.Series) -> float:
    """OU mean-reversion half-life in days, fit from Δy_t = a + k·y_{t-1} + e.
    `k` is the (negative, if reverting) pull-back rate; half-life =
    -ln(2)/k. Returns inf for k >= 0 (no reversion / explosive), matching
    `theory-lab/lessons/ou-mean-reversion.html`'s convention."""
    s = series.dropna()
    if len(s) < 30:
        return float("nan")
    y = s.to_numpy()
    dy, y_lag = np.diff(y), y[:-1]
    X = np.column_stack([np.ones_like(y_lag), y_lag])
    beta, *_ = np.linalg.lstsq(X, dy, rcond=None)
    k = beta[1]
    return float("inf") if k >= 0 else float(-np.log(2) / k)


def causal_zscore(levels: pd.Series, window: int) -> pd.Series:
    """Rolling z-score of a residual LEVEL series, standardized against its
    own trailing window ending at the PRIOR bar (`shift(1)`) — the window
    itself never includes the observation being scored, so this cannot
    manufacture the kind of self-referential "reversion" the rolling-hedge-
    ratio spread produced (see module docstring). The decomposition that
    produces `levels` has no free parameters at all; only this standardizing
    window is rolling, and rolling a z-score's own mean/std is the ordinary,
    non-circular use of a trailing window."""
    prior = levels.shift(1)
    mean, std = prior.rolling(window).mean(), prior.rolling(window).std()
    return (levels - mean) / std


def build_score_panel(levels: pd.DataFrame, closes: pd.DataFrame, pairs: list[str],
                      window: int = 60) -> pd.DataFrame:
    """Long-format panel: one row per (date, pair) with the causal residual
    z-score, that day's close (for cost normalization), and cost as a
    fraction of price (`default_spread(pair) / close` — cost shrinks as a %
    of price as an instrument's price level rises, e.g. gold $1,063→$4,328
    over this dataset, same reasoning as `forge.bars`'s ATR-normalization)."""
    rows = []
    for p in pairs:
        z = causal_zscore(levels[p], window)
        c = closes[p]
        rows.append(pd.DataFrame({
            "date": z.index, "pair": p, "z": z.to_numpy(),
            "close": c.to_numpy(), "cost_pct": (default_spread(p) / c).to_numpy(),
        }))
    panel = pd.concat(rows, ignore_index=True)
    panel = panel.dropna(subset=["z", "close"])
    return panel.sort_values(["date", "pair"]).reset_index(drop=True)


def add_forward_returns(panel: pd.DataFrame, closes: pd.DataFrame, h_grid=DEFAULT_H_GRID) -> pd.DataFrame:
    """Attach `fwd_r_H{h}`: cost-net log-price return from this date's close
    to the close `h` sessions later, per pair — the instrument's OWN realized
    return, not the residual's. If the residual z-score genuinely carries
    mean-reversion information, a very negative z (price below currency-
    network fair value) should predict a HIGHER forward return, and vice
    versa; ranking long/short on z and paying the pair's own realized return
    is exactly `forge.xsect.basket_returns`'s method, reused here because a
    common shock across the long and short legs still cancels the same way."""
    panel = panel.copy()
    for h in h_grid:
        fwd = {}
        for p in closes.columns:
            fwd[p] = np.log(closes[p].shift(-h)) - np.log(closes[p])
        fwd_df = pd.DataFrame(fwd)
        key = list(zip(panel["date"], panel["pair"]))
        raw_r = np.array([fwd_df.loc[d, p] if (d in fwd_df.index and p in fwd_df.columns) else np.nan
                          for d, p in key])
        panel[f"fwd_r_{h}"] = raw_r - panel["cost_pct"].to_numpy()   # one round-trip cost per position
    return panel


@dataclass
class RSpec:
    """A frozen cross-sectional strategy on the residual z-score: how many
    legs per side, how long to hold, which end of the ranking to buy."""
    k: int
    h: int
    sign: str            # 'reversion' (fade extremes) or 'momentum' (follow them)
    trained_through: str
    n_hypotheses: int
    train_stat: dict = field(default_factory=dict)
    fold: int = 0

    def describe(self) -> str:
        verb = "FADE" if self.sign == "reversion" else "FOLLOW"
        return (f"{verb} residual z-score: long the {self.k} MOST NEGATIVE "
                f"(cheapest vs currency-network fair value), short the {self.k} MOST "
                f"POSITIVE, hold {self.h} sessions | train t={self.train_stat.get('t', float('nan')):.2f}")

    def to_dict(self) -> dict:
        return {"k": self.k, "h": self.h, "sign": self.sign, "fold": self.fold,
                "trained_through": self.trained_through, "n_hypotheses": self.n_hypotheses,
                "train_stat": self.train_stat, "human": self.describe()}


def _rebalance_dates(dates: pd.DatetimeIndex, h: int) -> pd.DatetimeIndex:
    uniq = dates.unique().sort_values()
    return uniq[::h]


def basket_returns(panel: pd.DataFrame, k: int, h: int, sign: str) -> pd.Series:
    """Realized long-short spread return at each non-overlapping rebalance
    date: mean(fwd_r of the K long legs) - mean(fwd_r of the K short legs),
    scaled by /2 for the same $1-long + $1-short = $2-exposure convention as
    `forge.xsect.basket_returns`. Rebalances are non-overlapping (every `h`
    sessions, not every session with an h-session hold) for the same
    independence reason `forge.xsect` gives: an h-session hold rebalanced
    daily manufactures h-1 heavily autocorrelated pseudo-observations for
    every genuinely independent one."""
    col = f"fwd_r_{h}"
    if col not in panel.columns:
        raise ValueError(f"panel missing {col} — call add_forward_returns with h={h} in the grid")
    dates = _rebalance_dates(pd.DatetimeIndex(panel["date"]), h)
    out = {}
    for d in dates:
        day = panel[panel["date"] == d].dropna(subset=[col, "z"])
        if len(day) < 2 * k:
            continue
        ranked = day.sort_values("z")
        low, high = ranked.iloc[:k], ranked.iloc[-k:]
        if sign == "reversion":
            long_r, short_r = low[col], high[col]
        elif sign == "momentum":
            long_r, short_r = high[col], low[col]
        else:
            raise ValueError(f"unknown sign {sign!r}")
        out[d] = float(long_r.mean() - short_r.mean()) / 2.0
    return pd.Series(out, name="spread_r").sort_index()


def _tstat(s: pd.Series) -> tuple[float, float, int]:
    s = s.dropna()
    n = len(s)
    if n < 2:
        return float("nan"), float("nan"), n
    mean = float(s.mean())
    se = float(s.std(ddof=1)) / np.sqrt(n)
    return mean, (mean / se if se > 0 else float("nan")), n


def design(panel: pd.DataFrame, k_grid=DEFAULT_K_GRID, h_grid=DEFAULT_H_GRID,
          sign_grid=DEFAULT_SIGN_GRID) -> RSpec:
    """Score every (k, h, sign) combination on TRAIN data, freeze the best by
    t-stat. Small pre-registered grid (18 combinations by default) — a
    selection among a handful of pre-declared ideas, not a search."""
    results = []
    for h in h_grid:
        for k in k_grid:
            for sign in sign_grid:
                s = basket_returns(panel, k, h, sign)
                mean, t, n = _tstat(s)
                if n < 20:
                    continue
                results.append({"k": k, "h": h, "sign": sign, "mean": mean, "t": t, "n": n})
    n_hyp = len(k_grid) * len(h_grid) * len(sign_grid)
    if not results:
        return RSpec(k_grid[0], h_grid[0], sign_grid[0], "", n_hyp, train_stat={"t": float("nan"), "n": 0})
    best = max(results, key=lambda r: r["t"])
    return RSpec(best["k"], best["h"], best["sign"], str(panel["date"].max()), n_hyp, train_stat=best)


def apply_spec(spec: RSpec, panel: pd.DataFrame) -> pd.Series:
    return basket_returns(panel, spec.k, spec.h, spec.sign)


def fold_bounds(dates: pd.Series, n_folds: int, min_train_frac: float = 0.4) -> list[tuple]:
    """Expanding-window folds — duplicated from `forge.xsect.fold_bounds`
    rather than imported, same reasoning: this module stands alone."""
    t = pd.DatetimeIndex(dates).sort_values()
    start, end = t[0], t[-1]
    span = end - start
    first = start + span * min_train_frac
    edges = pd.date_range(first, end, periods=n_folds + 1)
    return [(start, edges[i], edges[i + 1]) for i in range(n_folds)]


def walk_forward(panel: pd.DataFrame, n_folds: int = 6, k_grid=DEFAULT_K_GRID,
                 h_grid=DEFAULT_H_GRID, sign_grid=DEFAULT_SIGN_GRID, verbose: bool = True) -> dict:
    specs, oos_series, fold_rows = [], [], []
    for i, (tr_start, split, te_end) in enumerate(fold_bounds(panel["date"], n_folds)):
        train = panel[(panel["date"] >= tr_start) & (panel["date"] < split)]
        test = panel[(panel["date"] >= split) & (panel["date"] < te_end)]
        if train.empty or test.empty:
            continue
        spec = design(train, k_grid, h_grid, sign_grid)
        spec.fold = i
        s = apply_spec(spec, test)
        mean, t, n = _tstat(s)
        fold_rows.append(dict(fold=i, train_end=str(split), test_end=str(te_end),
                              k=spec.k, h=spec.h, sign=spec.sign,
                              train_t=spec.train_stat.get("t", float("nan")),
                              oos_n=n, oos_mean=mean, oos_t=t))
        specs.append(spec)
        if n:
            oos_series.append(s)
        if verbose:
            print(f"  fold {i}: train->{split:%Y-%m-%d} | best train combo "
                  f"k={spec.k} h={spec.h} {spec.sign} (train t={spec.train_stat.get('t', float('nan')):.2f}) "
                  f"| OOS n={n} mean={mean:+.5f} t={t:.2f}", flush=True)
    all_s = pd.concat(oos_series) if oos_series else pd.Series(dtype=float)
    mean, t, n = _tstat(all_s)
    return {"folds": fold_rows, "specs": [s.to_dict() for s in specs],
           "oos": {"n": n, "mean": mean, "t": t,
                   "total": float(all_s.sum()) if n else 0.0,
                   "hit_rate": float((all_s > 0).mean()) if n else float("nan")},
           "series": all_s}


def shuffle_scores(panel: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """The cross-sectional null: permute WHICH pair's `z` gets used to rank,
    separately on each rebalance date, while every pair's own forward return
    stays attached to itself — same construction and same purpose as
    `forge.xsect.shuffle_scores`: if the real ranking's OOS t-stat is no
    better than this null's, the residual z-score is not contributing."""
    out = panel.copy()
    for d, idx in out.groupby("date").groups.items():
        pos = out.index.get_indexer(idx)
        out.iloc[pos, out.columns.get_loc("z")] = rng.permutation(out.iloc[pos]["z"].to_numpy())
    return out
