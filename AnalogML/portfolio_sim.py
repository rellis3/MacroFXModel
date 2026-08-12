#!/usr/bin/env python3
"""portfolio_sim.py — does the shape-matching edge survive being a PORTFOLIO?

pattern_scan_sweep.py answered "is the per-trade edge real and broad" (yes,
26/26 pairs positive on the overlapping check, 25/26 independent). That says
nothing about what happens when a real account tries to trade all 26 pairs
at once: FX pairs share currency legs (EURUSD/EURGBP/EURJPY all carry EUR
risk), so 26 "independent" positive-PF pairs can still combine into a much
smaller number of EFFECTIVE bets, and stacking correlated risk without a cap
is how a real per-trade edge turns into a real drawdown. This is that check.

Method:
  1. For every pair, walk NON-OVERLAPPING query windows (stride == window --
     the independent-trials setting from pattern_scan_sweep.py, so a trade
     here is a genuinely separate signal, not the same window shifted a few
     bars) and take the analog-consensus direction exactly like
     pattern_scan.py, via the SAME shared bricks (pylego.analog_signal,
     pylego.barrier_race) -- no second signal implementation.
  2. Every trade gets a real entry date AND exit date (from race_trades'
     bars_held) so trades across different pairs can be merged chronologically
     -- this is what pattern_scan.py's aggregate stats never needed to do.
  3. Simulate ONE account: risk `--risk-pct` of current equity per trade
     (sized at entry, crystallized at exit -- standard sequencing, not
     mark-to-market), but REFUSE a new entry if total currently-open risk
     would exceed `--max-concurrent-risk-pct` (a real capital constraint, not
     an unlimited-leverage fantasy). Skipped trades are counted and reported,
     never silently dropped.
  4. Report Sharpe / max drawdown / total return on the pooled account, a
     same-sizing single-pair benchmark for comparison (CLAUDE.md: "name the
     benchmark before claiming improvement" -- diversification only means
     something next to the concentrated alternative), and the average
     pairwise correlation of pairs' weekly returns (a cheap "how independent
     are these 26 bets, really" check).

Usage:
  python AnalogML/portfolio_sim.py --pairs gbpjpy,eurusd,audjpy,usdjpy --risk-pct 0.01
  python AnalogML/portfolio_sim.py --all-pairs --risk-pct 0.005 --max-concurrent-risk-pct 0.05
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pattern_scan import load_bars, pick_queries  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.analog_signal import neighbor_consensus  # noqa: E402
from pylego.barrier_race import Entry, race_trades  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.instruments import pip_size  # noqa: E402
from pylego.shape_match import rolling_shapes  # noqa: E402

ALL_PAIRS = [
    "audcad", "audchf", "audjpy", "audnzd", "audusd", "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd", "gold",
    "nzdjpy", "nzdusd", "usdcad", "usdchf", "usdjpy",
]


def build_pair_trades(pair: str, args: argparse.Namespace) -> list[dict]:
    """Dated trades for one pair: {pair, entry_date, exit_date, r}. Same
    causal analog-consensus direction call as pattern_scan.py's SIGNAL rows,
    just walked with stride == window (non-overlapping / independent, the
    stricter config) and carrying real dates instead of only pooled stats."""
    bars = load_bars(pair, args.timeframe)
    n = len(bars)
    closes = bars["close"].to_numpy()
    end_idx, shapes = rolling_shapes(closes, args.window)
    end_idx_set_pos = {int(e): i for i, e in enumerate(end_idx)}

    eval_start_ts = bars.index[-1] - pd.Timedelta(days=args.eval_years * 365.25)
    eval_start_idx = int(bars.index.searchsorted(eval_start_ts))
    queries = pick_queries(n, args.window, args.window, eval_start_idx,
                           args.max_bars_ahead, args.min_candidates)

    pip = pip_size(pair)
    sl_price = args.sl_pips * pip
    cost_price = default_spread(pair) if args.cost else 0.0

    trades: list[dict] = []
    for q in queries:
        pos = end_idx_set_pos.get(q)
        if pos is None:
            continue
        consensus = neighbor_consensus(
            bars, end_idx, shapes, shapes[pos], query_end=q,
            k=args.k, min_gap_bars=args.window,
            sl_price=sl_price, tp_r=args.tp_r, cost_price=cost_price,
            max_bars_ahead=args.max_bars_ahead, min_bars_ahead=args.min_bars_ahead,
        )
        if consensus.direction == 0:
            continue
        entry = Entry(idx=q + 1, direction=consensus.direction)
        resolved = race_trades(bars, [entry], sl=sl_price, tp_r=args.tp_r,
                               max_bars_ahead=args.max_bars_ahead, cost_price=cost_price,
                               min_bars_ahead=args.min_bars_ahead)
        if not resolved:
            continue
        t = resolved[0]
        trades.append({
            "pair": pair,
            "entry_date": bars.index[t["idx"]],
            "exit_date": bars.index[t["exit_idx"]],
            "r": t["r"],
        })
    return trades


def simulate_portfolio(trades: list[dict], risk_pct: float, max_concurrent_risk_pct: float) -> dict:
    """Event-driven single-account simulation. Risk is sized off equity AT
    ENTRY (standard sequencing); P&L crystallizes at exit. A new entry is
    REFUSED (not partially sized) if it would push total open risk above
    `max_concurrent_risk_pct` -- a hard capital constraint, reported, never
    silently absorbed. Also tracks TIME-WEIGHTED average concurrent-risk
    utilization (sum of open risk / equity, integrated over the actual
    calendar duration each level held) -- the metric that makes a portfolio
    vs single-pair Sharpe/DD comparison apples-to-apples: a portfolio that's
    near its cap most of the time has more capital at work than a single
    pair that rarely is, and that alone will show up as higher return AND
    higher drawdown regardless of diversification quality."""
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
            this_risk = equity * risk_pct
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

    avg_utilization = _time_weighted_avg(util_samples)
    return {"equity_curve": equity_curve, "taken": taken, "skipped": skipped,
            "final_equity": equity, "avg_utilization": avg_utilization}


def _time_weighted_avg(samples: list[tuple]) -> float:
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
    single pair), so its own average utilization matches the portfolio's --
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


def sharpe_and_dd(equity_curve: list[tuple]) -> dict:
    if len(equity_curve) < 3:
        return {"sharpe": float("nan"), "max_dd": float("nan"), "total_return": float("nan")}
    s = pd.Series(
        [e for _, e in equity_curve],
        index=pd.DatetimeIndex([d for d, _ in equity_curve]),
    ).sort_index()
    s = s[~s.index.duplicated(keep="last")]
    daily = s.resample("1D").last().ffill().dropna()
    rets = daily.pct_change().dropna()
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else float("nan")
    running_max = daily.cummax()
    dd = (daily / running_max - 1.0)
    max_dd = float(dd.min())
    total_return = float(s.iloc[-1] / s.iloc[0] - 1.0)
    return {"sharpe": sharpe, "max_dd": max_dd, "total_return": total_return}


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


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pairs", default=None, help="comma-separated; default is --all-pairs")
    p.add_argument("--all-pairs", action="store_true", help="use every locally-available pair")
    p.add_argument("--timeframe", default="1h")
    p.add_argument("--window", type=int, default=64)
    p.add_argument("--k", type=int, default=20)
    p.add_argument("--eval-years", type=float, default=3.0)
    p.add_argument("--min-candidates", type=int, default=2000)
    p.add_argument("--sl-pips", type=float, default=20.0)
    p.add_argument("--tp-r", type=float, default=1.5)
    p.add_argument("--max-bars-ahead", type=int, default=200)
    p.add_argument("--min-bars-ahead", type=int, default=10)
    p.add_argument("--cost", action="store_true", default=True)
    p.add_argument("--no-cost", dest="cost", action="store_false")
    p.add_argument("--risk-pct", type=float, default=0.01, help="fraction of equity risked per trade")
    p.add_argument("--max-concurrent-risk-pct", type=float, default=0.05,
                   help="hard cap on total simultaneously-open risk, as a fraction of equity")
    args = p.parse_args()

    pairs = args.pairs.split(",") if args.pairs else ALL_PAIRS
    print(f"[setup] {len(pairs)} pairs, window={args.window} k={args.k} (non-overlapping/independent "
          f"trades), risk={args.risk_pct:.2%}/trade, max concurrent risk={args.max_concurrent_risk_pct:.2%}")

    all_trades: list[dict] = []
    per_pair_trades: dict[str, list[dict]] = {}
    for pair in pairs:
        t = build_pair_trades(pair, args)
        per_pair_trades[pair] = t
        all_trades.extend(t)
        print(f"  {pair:<8} {len(t):>4} trades")

    if not all_trades:
        raise SystemExit("no trades generated -- check pair data / eval-years")

    print(f"\n[portfolio] {len(all_trades)} total signals across {len(pairs)} pairs")
    port = simulate_portfolio(all_trades, args.risk_pct, args.max_concurrent_risk_pct)
    stats = sharpe_and_dd(port["equity_curve"])
    print(f"  taken={port['taken']}  skipped(risk cap)={port['skipped']}  "
          f"final_equity={port['final_equity']:.3f}x  total_return={stats['total_return']:.1%}  "
          f"max_dd={stats['max_dd']:.1%}  Sharpe={stats['sharpe']:.2f}  "
          f"avg_utilization={port['avg_utilization']:.1%}")

    corr = pairwise_correlation_summary(all_trades)
    if corr is not None:
        print(f"  avg pairwise weekly-return correlation across pairs: {corr:+.3f} "
              f"(0 = independent, 1 = same bet)")

    print(f"\n== benchmark A: same sizing ({args.risk_pct:.2%}/trade), ONE pair alone "
          f"(cap rarely binds -> LOWER utilization than the portfolio, not a fair comparison) ==")
    for bench_pair in pairs[:3]:
        bt = per_pair_trades.get(bench_pair, [])
        if not bt:
            continue
        bp = simulate_portfolio(bt, args.risk_pct, args.max_concurrent_risk_pct)
        bs = sharpe_and_dd(bp["equity_curve"])
        print(f"  {bench_pair:<8} n={len(bt):>4}  total_return={bs['total_return']:>7.1%}  "
              f"max_dd={bs['max_dd']:>7.1%}  Sharpe={bs['sharpe']:>5.2f}  "
              f"avg_utilization={bp['avg_utilization']:>5.1%}")

    print(f"\n== benchmark B: SAME AVERAGE UTILIZATION as the portfolio ({port['avg_utilization']:.1%}) -- "
          f"risk_pct scaled up per pair so capital deployed is genuinely comparable ==")
    for bench_pair in pairs[:3]:
        bt = per_pair_trades.get(bench_pair, [])
        if not bt:
            continue
        m = matched_utilization_benchmark(bt, args.risk_pct, port["avg_utilization"])
        if m["result"] is None:
            print(f"  {bench_pair:<8} (no trades / zero utilization, can't match)")
            continue
        r = m["result"]
        print(f"  {bench_pair:<8} n={len(bt):>4}  matched_risk={m['matched_risk_pct']:>6.2%}/trade  "
              f"total_return={r['total_return']:>7.1%}  max_dd={r['max_dd']:>7.1%}  Sharpe={r['sharpe']:>5.2f}  "
              f"achieved_utilization={m['achieved_utilization']:>5.1%}")

    print("\n[read this] Benchmark A is the one that made the portfolio look like it wins on both "
          "return AND drawdown -- but it wasn't running at the same capital utilization, so that "
          "comparison was confounded. Benchmark B fixes that: it's what a single pair looks like "
          "risking enough per trade to deploy the SAME average fraction of the account as the "
          "portfolio actually does. Whatever gap remains between the portfolio and benchmark B is "
          "the real diversification effect (or lack of it) -- not a capital-deployed illusion.")

    print("\n[caveat] mark-to-close only (no intra-trade floating equity), fixed risk-% sizing "
          "(not vol-scaled per pair), no live spread variation, unoptimised parameters throughout. "
          "This tests whether the ALREADY-FOUND per-trade edge survives becoming a portfolio -- it "
          "does not re-validate the per-trade edge itself (see pattern_scan_sweep.py for that).")


if __name__ == "__main__":
    main()
