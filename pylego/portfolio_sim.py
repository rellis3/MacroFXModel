"""portfolio_sim — the shared event-driven single-account portfolio
simulator, extracted from `AnalogML/portfolio_sim.py` (built for the
retired k-NN shape-matching method) once a second consumer needed the exact
same engine (`AnalogML/motif_portfolio_sim.py`, for the touches motif) —
CLAUDE.md's brick rule: a second real consumer is the signal to extract,
before a copy accumulates.

Contract: every function here operates on a plain `trades: list[dict]`,
each `{pair, entry_date, exit_date, r}` — no signal-specific knowledge
(doesn't care whether the trade came from shape-matching, touches, or
anything else). The caller builds the dated trade list from whatever
detector/entry-selection logic it's testing; this only asks "does the
per-trade edge survive being a portfolio."

Answers the real question a per-pair edge doesn't: FX pairs share currency
legs (EURUSD/EURGBP/EURJPY all carry EUR risk), so N "independent"
positive-PF pairs can combine into far fewer EFFECTIVE bets, and stacking
correlated risk without a cap is how a real per-trade edge turns into a
real drawdown.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def simulate_portfolio(trades: list[dict], risk_pct: float, max_concurrent_risk_pct: float) -> dict:
    """Event-driven single-account simulation. Risk is sized off equity AT
    ENTRY (standard sequencing); P&L crystallizes at exit. A new entry is
    REFUSED (not partially sized) if it would push total open risk above
    `max_concurrent_risk_pct` — a hard capital constraint, reported, never
    silently absorbed. Also tracks TIME-WEIGHTED average concurrent-risk
    utilization (sum of open risk / equity, integrated over the actual
    calendar duration each level held) — the metric that makes a portfolio
    vs single-pair Sharpe/DD comparison apples-to-apples: a portfolio that's
    near its cap most of the time has more capital at work than a single
    pair that rarely is, and that alone will show up as higher return AND
    higher drawdown regardless of diversification quality.

    A trade dict may optionally carry `size_mult` (default 1.0 if absent —
    every existing caller that doesn't set it is unaffected) to scale that
    ONE trade's risk relative to `risk_pct`, e.g. sizing down on a signal
    that some independent read (an HTF conflict, a confidence bucket) marks
    as lower-conviction, without changing entry/exit selection at all."""
    events = []
    for i, t in enumerate(trades):
        events.append((t["entry_date"], 0, i, "entry"))  # entries sort before exits on a tie
        events.append((t["exit_date"], 1, i, "exit"))
    events.sort(key=lambda e: (e[0], e[1]))

    equity = 1.0
    open_risk: dict[int, float] = {}
    equity_curve = [(events[0][0] if events else pd.Timestamp.now(), equity)]
    taken, skipped = 0, 0
    util_samples: list[tuple] = []  # (date, utilization_fraction) after each event

    for date, _order, i, kind in events:
        t = trades[i]
        if kind == "entry":
            current_open = sum(open_risk.values())
            this_risk = equity * risk_pct * t.get("size_mult", 1.0)
            if current_open + this_risk > equity * max_concurrent_risk_pct:
                skipped += 1
                util_samples.append((date, current_open / equity))
                continue
            open_risk[i] = this_risk
            taken += 1
        else:
            risk_dollars = open_risk.pop(i, None)
            if risk_dollars is None:
                continue  # was skipped at entry
            equity += risk_dollars * t["r"]
            equity_curve.append((date, equity))
        util_samples.append((date, sum(open_risk.values()) / equity))

    avg_utilization = time_weighted_avg(util_samples)
    return {"equity_curve": equity_curve, "taken": taken, "skipped": skipped,
            "final_equity": equity, "avg_utilization": avg_utilization}


def time_weighted_avg(samples: list[tuple]) -> float:
    """samples: [(date, value), ...] sorted by date. Integrates `value` over
    the actual calendar duration it held (not a plain mean of samples, which
    would over-weight quiet stretches with few events the same as busy
    ones)."""
    if len(samples) < 2:
        return samples[0][1] if samples else 0.0
    total_weight = 0.0
    weighted_sum = 0.0
    for (d0, v0), (d1, _v1) in zip(samples[:-1], samples[1:]):
        w = (d1 - d0).total_seconds()
        if w > 0:
            weighted_sum += v0 * w
            total_weight += w
    return weighted_sum / total_weight if total_weight > 0 else float(np.mean([v for _, v in samples]))


def matched_utilization_benchmark(trades: list[dict], base_risk_pct: float,
                                  target_utilization: float) -> dict:
    """Find the risk_pct a SINGLE pair (or any trade set) would need, run
    uncapped (max_concurrent_risk_pct=1.0, effectively never binding for a
    single pair), so its own average utilization matches the portfolio's —
    then report Sharpe/DD at THAT risk level. Utilization scales linearly
    with risk_pct when nothing caps it, so one calibration pass is exact."""
    probe = simulate_portfolio(trades, base_risk_pct, max_concurrent_risk_pct=1.0)
    natural_util = probe["avg_utilization"]
    if natural_util <= 0:
        return {"matched_risk_pct": None, "natural_utilization": natural_util, "result": None}
    matched_risk_pct = base_risk_pct * (target_utilization / natural_util)
    matched = simulate_portfolio(trades, matched_risk_pct, max_concurrent_risk_pct=1.0)
    stats = sharpe_and_dd(matched["equity_curve"])
    return {"matched_risk_pct": matched_risk_pct, "natural_utilization": natural_util,
            "achieved_utilization": matched["avg_utilization"], "result": {**matched, **stats}}


_NAN_STATS = {
    "sharpe": float("nan"), "sortino": float("nan"), "calmar": float("nan"),
    "cagr": float("nan"), "max_dd": float("nan"), "max_dd_days": float("nan"),
    "total_return": float("nan"), "skew": float("nan"),
}


def daily_equity_series(equity_curve: list[tuple]) -> pd.Series:
    """The same date-indexed, forward-filled daily equity series
    `sharpe_and_dd` computes internally -- extracted so a caller that wants
    to CHART the equity curve (not just summarise it) gets the identical
    series the headline stats were computed from, never a second resample
    that could silently drift from what Sharpe/max_dd actually saw."""
    if len(equity_curve) < 2:
        return pd.Series(dtype=np.float64)
    s = pd.Series(
        [e for _, e in equity_curve],
        index=pd.DatetimeIndex([d for d, _ in equity_curve]),
    ).sort_index()
    s = s[~s.index.duplicated(keep="last")]
    return s.resample("1D").last().ffill().dropna()


def sharpe_and_dd(equity_curve: list[tuple]) -> dict:
    """Sharpe/max_dd (the original two fields, unchanged for every existing
    caller) PLUS the rest of the standard quant results-card set: Sortino
    (Sharpe with only downside deviation in the denominator -- doesn't
    penalise upside volatility), CAGR, Calmar (CAGR / |max_dd| -- return
    per unit of the worst drawdown actually endured), max_dd_days (longest
    stretch, in calendar days, spent below a prior equity high -- pain
    duration, not just pain depth), and skew of daily returns (a negative-
    skew equity curve has more/bigger down days than up days even at equal
    Sharpe -- the classic 'steady grind up, sudden crash down' shape)."""
    if len(equity_curve) < 3:
        return dict(_NAN_STATS)
    daily = daily_equity_series(equity_curve)
    rets = daily.pct_change().dropna()
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else float("nan")

    downside = rets[rets < 0]
    downside_std = float(downside.std()) if len(downside) > 1 else 0.0
    if downside_std > 0:
        sortino = float(rets.mean() / downside_std * np.sqrt(252))
    else:
        sortino = float("inf") if rets.mean() > 0 else float("nan")

    running_max = daily.cummax()
    dd = (daily / running_max - 1.0)
    max_dd = float(dd.min())

    # Longest run (calendar days) spent below a prior equity high -- reset
    # the clock every time a NEW high is set, track the longest gap.
    max_dd_days = 0
    peak_date = daily.index[0]
    for date, val, is_peak in zip(daily.index, daily.to_numpy(), (dd >= 0).to_numpy()):
        if is_peak:
            peak_date = date
        else:
            gap = (date - peak_date).days
            if gap > max_dd_days:
                max_dd_days = gap

    total_return = float(daily.iloc[-1] / daily.iloc[0] - 1.0)
    years = (daily.index[-1] - daily.index[0]).days / 365.25
    if years > 0 and daily.iloc[0] > 0 and daily.iloc[-1] > 0:
        cagr = float((daily.iloc[-1] / daily.iloc[0]) ** (1.0 / years) - 1.0)
    else:
        cagr = float("nan")
    calmar = (cagr / abs(max_dd)) if (max_dd < 0 and not np.isnan(cagr)) else float("nan")

    if len(rets) > 2 and rets.std() > 0:
        centered = rets - rets.mean()
        skew = float((centered ** 3).mean() / (rets.std(ddof=0) ** 3))
    else:
        skew = float("nan")

    return {
        "sharpe": sharpe, "sortino": sortino, "cagr": cagr, "calmar": calmar,
        "max_dd": max_dd, "max_dd_days": max_dd_days, "total_return": total_return,
        "skew": skew,
    }


def monte_carlo_bootstrap(trades: list[dict], risk_pct: float, n_sims: int = 1000,
                          seed: int = 20260814) -> dict:
    """Classic trade-based Monte Carlo (the MultiCharts/TradeStation-style
    check, not a price-path simulation): resample the CLOSED-TRADE r *
    size_mult risk fractions WITH REPLACEMENT, `n_sims` times, replaying
    each sample as a sequential fixed-fractional equity curve (ignores real
    calendar concurrency -- `simulate_portfolio` is the calendar-accurate
    replay; this asks a different question: 'how much does the result
    depend on the luck of this exact trade ORDER/SAMPLE, not whether the
    portfolio mechanics were realistic'). Reports percentile bands so a
    single lucky/unlucky historical sequence can be told apart from a
    robust one.

    Fixed `seed` (not the wall clock) so re-running the same trade list
    reproduces the exact same bands -- a Monte Carlo report that changes
    every run without the underlying trades changing is not a report
    anyone can act on."""
    r = np.array([t["r"] * t.get("size_mult", 1.0) for t in trades], dtype=np.float64)
    n = len(r)
    if n == 0:
        return {"n_sims": 0, "n_trades": 0}
    rng = np.random.default_rng(seed)
    finals = np.empty(n_sims)
    max_dds = np.empty(n_sims)
    for i in range(n_sims):
        sample = rng.choice(r, size=n, replace=True)
        equity = np.cumprod(1.0 + risk_pct * sample)
        finals[i] = equity[-1]
        running_max = np.maximum.accumulate(equity)
        max_dds[i] = (equity / running_max - 1.0).min()
    return {
        "n_sims": n_sims, "n_trades": n,
        "final_return_p5": float(np.percentile(finals, 5) - 1.0),
        "final_return_p50": float(np.percentile(finals, 50) - 1.0),
        "final_return_p95": float(np.percentile(finals, 95) - 1.0),
        "max_dd_p5": float(np.percentile(max_dds, 5)),
        "max_dd_p50": float(np.percentile(max_dds, 50)),
        "max_dd_p95": float(np.percentile(max_dds, 95)),
        "prob_net_loss": float((finals < 1.0).mean()),
        "worst_max_dd": float(max_dds.min()),
    }


def pairwise_correlation_summary(trades: list[dict]) -> float | None:
    df = pd.DataFrame(trades)
    if df.empty or df["pair"].nunique() < 2:
        return None
    entry_dates = pd.DatetimeIndex(df["entry_date"])
    if entry_dates.tz is not None:
        entry_dates = entry_dates.tz_convert("UTC").tz_localize(None)
    df["week"] = entry_dates.to_period("W").astype(str)
    wide = df.pivot_table(index="week", columns="pair", values="r", aggfunc="sum", fill_value=0.0)
    corr = wide.corr()
    vals = corr.to_numpy()
    n = vals.shape[0]
    off_diag = [vals[i, j] for i in range(n) for j in range(n) if i != j]
    return float(np.mean(off_diag)) if off_diag else None
