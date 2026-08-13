"""xsect — cross-sectional ranking across the whole instrument universe.

Every prior layer in `forge` asks a DIRECTIONAL question about ONE instrument:
"will gold go up from this level?" That is the hardest version of the
question, for a specific reason a single-instrument backtest can't see —
gold's own price series is dominated by market-wide shocks (the dollar,
macro risk-on/off) that no level-touch can predict, and every directional bet
is fully exposed to them. The M15/H4 gold runs in this repo found nothing
partly because of this: `atr_pct=hi` and `dxy_confirm` kept getting selected,
which is the search rediscovering "when is the market moving for reasons
that have nothing to do with this level" — a market-wide factor, not
information about gold.

Cross-sectional ranking sidesteps that by asking a RELATIVE question instead:
not "will gold go up", but "of these 26 instruments, which is most extended
from its own weekly structure right now, compared to the others, at this same
moment". Go long the most compelling end of that ranking, short the other end.
Two things fall out of asking it this way, not one:

  1. A common shock that moves every instrument together cancels between the
     long and short legs — you are only exposed to the DIFFERENCE in how
     extended each instrument is, not to the shock itself.
  2. It only needs the ORDERING to carry weak information, not an outright
     P(up) > 50%+cost call on any single name. A much lower bar than
     directional prediction.

This module is deliberately smaller and simpler than the single-instrument
search (`levels.py`→`discover.py`), for a reason worth stating: a portfolio
of 26 legs is close to naturally diversified regardless of the signal, so the
interesting question collapses from "which of 30,000 conditional cells work"
to "does this one specific score rank instruments meaningfully" — a handful
of pre-registered (K, holding period, sign) combinations, not a search.

Rebalances are NON-OVERLAPPING (every `H` days, not every day with an
H-day hold) on purpose: an H-day hold rebalanced daily produces H-1 heavily
autocorrelated observations for every independent one, which is the same
"looks like more data than it is" trap `pattern_scan_sweep.py`'s
stride==window check exists to catch elsewhere in this repo. Non-overlapping
windows trade sample count for observations that are actually close to
independent, so a plain (not cluster-robust) t-test on the resulting series
is defensible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from pylego.costs import default_spread

from forge.bars import frame, load_m1, week_key

DEFAULT_K_GRID = (3, 5)
DEFAULT_H_GRID = (1, 3, 5)          # holding period, in rebalance-timeframe bars
DEFAULT_SIGN_GRID = ("reversion", "momentum")


def discover_universe(data_root: str = "VolRangeForecaster/data/m1") -> list[str]:
    """Every pair with a local M1 parquet — the same universe every other
    26-pair sweep in this repo uses, read from disk rather than hardcoded so
    it never silently drifts from what data actually exists."""
    return sorted(p.stem.removesuffix("_m1") for p in Path(data_root).glob("*_m1.parquet"))


def _weekly_open(daily: pd.DataFrame, day_start_hour: int) -> pd.Series:
    """This week's own open, valid from the moment the week starts.

    Not the PRIOR week's open (that's `pwl`/`pwh`'s job in `levels.py`) — the
    CURRENT week's, which is causal throughout the week: a Wednesday bar
    already knows what Monday's open was. Matches `week_anchor_levels`'s
    `wopen` definition — the one anchor in that module born at the START of
    its own period rather than the completion of the prior one.
    """
    wk = week_key(daily.index, day_start_hour)
    open_by_week = daily.groupby(wk)["open"].transform("first")
    return pd.Series(open_by_week.to_numpy(), index=daily.index, name="week_open")


def build_panel(pairs: list[str], tf: str = "d1", data_root: str = "VolRangeForecaster/data/m1",
                day_start_hour: int = 0, atr_period: int = 14,
                years: float = 0) -> pd.DataFrame:
    """Long-format panel: one row per (date, pair), with the causal extension
    score and per-pair cost. M1 is loaded and immediately resampled/discarded
    per pair — only `tf` bars are kept — so the whole 26-pair universe fits in
    memory at once despite each M1 parquet being tens of millions of rows.

    `ext_score`: signed distance of the bar's own OPEN from `week_open`, in
    ATR units, using PRIOR-bar ATR (`atr0` — the scale known at the moment of
    that same open, never the ATR of the bar itself). Positive = above this
    week's open; the magnitude is what gets ranked cross-sectionally.

    `years`, if given, is measured back from ONE shared reference timestamp —
    the LATEST last-bar across the whole `pairs` list — not each pair's own
    last bar. This mattered in practice: `audchf`'s local parquet stops in
    2020 (roughly six years before every other pair here), so a per-pair
    cutoff gave it a 2018-2020 window while every other pair got 2024-2026,
    and concatenating them produced a panel whose "2 years" actually spanned
    eight, with most dates covered by only one or two pairs — silently
    breaking the cross-section (a rank among 1-2 names isn't one) rather than
    raising an error, which is the worse kind of bug. A pair that stops early
    simply stops contributing rows once its data runs out; the reference date
    no longer moves when that happens.
    """
    last_bars = {p: load_m1(p, data_root).index[-1] for p in pairs}
    reference = max(last_bars.values())
    cutoff = reference - pd.Timedelta(days=365.25 * years) if years else None

    rows = []
    for pair in pairs:
        m1 = load_m1(pair, data_root)
        if cutoff is not None:
            m1 = m1[m1.index >= cutoff]
            if m1.empty:
                continue
        bars = frame(m1, tf, day_start_hour=day_start_hour, atr_period=atr_period)
        wopen = _weekly_open(bars, day_start_hour)
        scale = bars["atr0"].replace(0, np.nan)
        rows.append(pd.DataFrame({
            "date": bars.index, "pair": pair,
            "open": bars["open"].to_numpy(),
            "atr0": scale.to_numpy(),
            "week_open": wopen.to_numpy(),
            "ext_score": ((bars["open"] - wopen) / scale).to_numpy(),
            "cost_price": default_spread(pair),
        }))
        del m1
    panel = pd.concat(rows, ignore_index=True)
    panel = panel.dropna(subset=["ext_score", "atr0"])
    return panel.sort_values(["date", "pair"]).reset_index(drop=True)


def add_forward_returns(panel: pd.DataFrame, h_grid=DEFAULT_H_GRID) -> pd.DataFrame:
    """Attach `fwd_r_H{h}` for every `h` in `h_grid`: the ATR-normalized,
    cost-net move from THIS bar's open to the open `h` bars later, per pair.

    Computed once per pair via a plain per-group shift — no lookahead risk
    (a forward return is explicitly about the future; the causality contract
    here is that `ext_score` at date `t` must not use it, not that it can't
    exist as a column)."""
    panel = panel.copy()
    cost_r = panel["cost_price"] / panel["atr0"]
    for h in h_grid:
        fwd_open = panel.groupby("pair")["open"].shift(-h)
        raw_r = (fwd_open - panel["open"]) / panel["atr0"]
        panel[f"fwd_r_{h}"] = raw_r - cost_r     # one round-trip cost per position
    return panel


@dataclass
class XSpec:
    """A frozen cross-sectional strategy: which score, how many legs per side,
    how long to hold, and which end of the ranking to buy."""
    k: int
    h: int
    sign: str            # 'reversion' (fade the extremes) or 'momentum' (follow them)
    trained_through: str
    n_hypotheses: int
    train_stat: dict = field(default_factory=dict)
    fold: int = 0

    def describe(self) -> str:
        verb = "FADE" if self.sign == "reversion" else "FOLLOW"
        return (f"{verb} weekly-open extension: long the {self.k} MOST BELOW week-open"
                f"{'(reversion: they are oversold)' if self.sign == 'reversion' else '(momentum: sell the laggards, buy the leaders)'}"
                f", short the {self.k} MOST ABOVE, hold {self.h} rebalance bars"
                f" | train t={self.train_stat.get('t', float('nan')):.2f}")

    def to_dict(self) -> dict:
        return {"k": self.k, "h": self.h, "sign": self.sign, "fold": self.fold,
                "trained_through": self.trained_through, "n_hypotheses": self.n_hypotheses,
                "train_stat": self.train_stat, "human": self.describe()}


def _rebalance_dates(dates: pd.DatetimeIndex, h: int) -> pd.DatetimeIndex:
    """Every `h`-th distinct date — the non-overlapping rebalance clock for a
    holding period of `h` bars. Anchored to the EARLIEST date in view so a
    fold boundary never shifts the phase of who overlaps whom."""
    uniq = dates.unique().sort_values()
    return uniq[::h]


def basket_returns(panel: pd.DataFrame, k: int, h: int, sign: str) -> pd.Series:
    """The realized long-short spread return at each non-overlapping rebalance
    date: mean(fwd_r of the K long legs) − mean(fwd_r of the K short legs).

    `reversion`: long = most BELOW week-open (bet they revert up), short =
    most ABOVE. `momentum`: the opposite — long the leaders, short the
    laggards. Both are always available to the walk-forward's own selection;
    this function does not decide which is right, same discipline as
    `pylego.barrier_race` always racing both directions from one entry.
    """
    col = f"fwd_r_{h}"
    if col not in panel.columns:
        raise ValueError(f"panel missing {col} — call add_forward_returns with h={h} in the grid")
    dates = _rebalance_dates(pd.DatetimeIndex(panel["date"]), h)
    out = {}
    for d in dates:
        day = panel[panel["date"] == d].dropna(subset=[col, "ext_score"])
        if len(day) < 2 * k:
            continue
        ranked = day.sort_values("ext_score")
        below, above = ranked.iloc[:k], ranked.iloc[-k:]
        if sign == "reversion":
            long_r, short_r = below[col], above[col]
        elif sign == "momentum":
            long_r, short_r = above[col], below[col]
        else:
            raise ValueError(f"unknown sign {sign!r}")
        out[d] = float(long_r.mean() - short_r.mean()) / 2.0   # /2: a $1 long + $1 short is $2 of exposure
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
          sign_grid=DEFAULT_SIGN_GRID) -> XSpec:
    """Score every (k, h, sign) combination on TRAIN data and freeze the best
    by t-stat. The grid is small and pre-registered (12 combinations by
    default) — this is a selection among a handful of pre-declared ideas, not
    a search, and is reported as such: `n_hypotheses` is exactly the grid
    size, no larger."""
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
        return XSpec(k_grid[0], h_grid[0], sign_grid[0], "", n_hyp,
                    train_stat={"t": float("nan"), "n": 0})
    best = max(results, key=lambda r: r["t"])
    return XSpec(best["k"], best["h"], best["sign"], str(panel["date"].max()), n_hyp,
                train_stat=best)


def apply_spec(spec: XSpec, panel: pd.DataFrame) -> pd.Series:
    """The frozen spec's realized returns on unseen panel data."""
    return basket_returns(panel, spec.k, spec.h, spec.sign)


def fold_bounds(dates: pd.Series, n_folds: int, min_train_frac: float = 0.4) -> list[tuple]:
    """Same expanding-window scheme as `validate.fold_bounds`, duplicated
    rather than imported: `xsect` is meant to stand alone (a portfolio study,
    not a per-instrument one) and the two are coincidentally identical in
    shape today but answer different questions — importing would couple them
    for no shared reason beyond that coincidence."""
    t = pd.DatetimeIndex(dates).sort_values()
    start, end = t[0], t[-1]
    span = end - start
    first = start + span * min_train_frac
    edges = pd.date_range(first, end, periods=n_folds + 1)
    return [(start, edges[i], edges[i + 1]) for i in range(n_folds)]


def walk_forward(panel: pd.DataFrame, n_folds: int = 6, k_grid=DEFAULT_K_GRID,
                 h_grid=DEFAULT_H_GRID, sign_grid=DEFAULT_SIGN_GRID,
                 verbose: bool = True) -> dict:
    """Design → freeze → score, fold by fold — the portfolio-study counterpart
    of `validate.walk_forward`. Returns the concatenated OOS spread-return
    series and its aggregate stats."""
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
            print(f"  fold {i}: train→{split:%Y-%m-%d} | best train combo "
                  f"k={spec.k} h={spec.h} {spec.sign} (train t={spec.train_stat.get('t', float('nan')):.2f}) "
                  f"| OOS n={n} mean={mean:+.4f} t={t:.2f}", flush=True)
    all_s = pd.concat(oos_series) if oos_series else pd.Series(dtype=float)
    mean, t, n = _tstat(all_s)
    return {"folds": fold_rows, "specs": [s.to_dict() for s in specs],
           "oos": {"n": n, "mean": mean, "t": t,
                   "total": float(all_s.sum()) if n else 0.0,
                   "hit_rate": float((all_s > 0).mean()) if n else float("nan")},
           "series": all_s}


def shuffle_scores(panel: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """The cross-sectional null: permute WHICH pair's `ext_score` gets used to
    rank, separately on EACH rebalance date, while every pair's own forward
    return stays attached to itself.

    This is the direct analogue of `discover.randomize_levels` for a ranking
    strategy, and it targets the exact same failure mode: a long-short spread
    can look profitable purely because SOME pairs drift more than others over
    the sample (gold's decade, say), with no real information in which pair
    the score currently points at. Shuffling the score→pair correspondence
    within each date preserves that date's actual cross-sectional return
    dispersion (a real, unfakeable quantity) while destroying any information
    the score carried about which pair to be long vs short. If the real
    ranking's OOS t-stat is no better than this null's, the score is not
    contributing — the strategy is just being long a diversified, drifting
    basket.
    """
    out = panel.copy()
    for d, idx in out.groupby("date").groups.items():
        pos = out.index.get_indexer(idx)
        out.iloc[pos, out.columns.get_loc("ext_score")] = rng.permutation(
            out.iloc[pos]["ext_score"].to_numpy())
    return out
