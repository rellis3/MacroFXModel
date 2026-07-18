"""volatility_bot Layer 2 — signal-conditioned SL/TP grid, replayed on real M1.

Layer 1 (VolRangeForecaster/sltp_distribution.py) asks "for a fixed SL/TP grid,
which barrier gets touched first" using MECHANICAL entries (every 4h, both
directions) — signal-agnostic terrain. Layer 2 asks the SAME question but only
at THIS bot's real entry points, single direction, with real costs — see
PYTHON_LEGO.md §8.

What "real entry points" means here: `engine.decide()` (the bot's actual,
unmodified decision function) is replayed tick-by-tick through years of real M1
history, using a `SessionTracker` exactly as the live bot runs it. The band
levels it decides against use THIS PAIR's own historical daily volatility (a
causal rolling realized-vol proxy computed locally — see `_sigma_proxy` — NOT
the platform's exact YZ-30/GARCH; a documented approximation, not a claim of
bit-identical σ) scaled by the live policy's frac/sigma ratio, so the bands
widen and narrow with the pair's own vol regime across history, not frozen at
today's single reading.

CAVEAT, stated loudly: this is "TODAY's learned policy, replayed against
historical prices" — not "what the bot actually decided on each historical
day" (the policy itself is periodically relearned and may have differed in the
past). It answers "does today's policy hold up historically", which is a
different, honest question from "what did the bot do."

The exit is deliberately NOT replayed — once we have a real (time, direction,
entry) from decide(), the exit is handed to the shared `pylego.barrier_race`
grid (a swept SL/TP, not the bot's own adaptive fade/follow inner/outer exit).
This is intentionally a different question: "given this bot's real entries,
what UNIFORM fixed SL/TP would have worked best OOS" — not a full bot replica.

Usage:
  python volatility_bot/layer2_sltp_replay.py --pair gold
  python volatility_bot/layer2_sltp_replay.py --pair eurusd --csv-out VolRangeForecaster/data/vol_bot_layer2_eurusd.csv
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')   # Windows console default (cp1252) can't print the policy's '·'/'≈'
sys.stdout.reconfigure(line_buffering=True)    # a redirected/backgrounded run defaults to block-buffered —
                                                # a multi-pair sweep can run for hours with NOTHING written to
                                                # the log file until it exits otherwise (bit us once already)

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from pylego.instruments import pip_size, asset_class  # noqa: E402
from pylego.costs import default_spread  # noqa: E402
from pylego.barrier_race import Entry, race_grid  # noqa: E402
from volatility_bot.engine import SessionTracker, decide, session_open_epoch  # noqa: E402

_M1_DIR = os.path.join(os.path.dirname(__file__), '..', 'VolRangeForecaster', 'data', 'm1')
_PLAN_SNAPSHOT = os.path.join(os.path.dirname(__file__), '..', 'VolRangeForecaster', 'data',
                              'volatility_bot_plan_snapshot.json')
_SIGMA_WINDOW = 20   # trading sessions, causal rolling realized-vol proxy


def load_plan() -> dict:
    with open(_PLAN_SNAPSHOT, encoding='utf-8') as f:
        raw = json.load(f)
    return raw['plan'] if 'plan' in raw else raw


def load_m1(pair: str) -> pd.DataFrame:
    path = os.path.join(_M1_DIR, f'{pair}_m1.parquet')
    if not os.path.exists(path):
        raise FileNotFoundError(f'{path} not found')
    df = pd.read_parquet(path)
    ts_col = 'datetime' if 'datetime' in df.columns else ('time' if 'time' in df.columns else None)
    if ts_col:
        df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
        df = df.set_index(ts_col)
    elif df.index.tz is None:
        df.index = pd.to_datetime(df.index, utc=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    return df[['open', 'high', 'low', 'close']].sort_index()


def session_bounds(bars: pd.DataFrame) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """London-midnight session boundaries spanning the loaded M1 history, using
    the bot's OWN session_open_epoch (not re-derived) so replay sessions line up
    with what the live bot considers a trading day."""
    start_epoch = session_open_epoch(int(bars.index.min().timestamp()))
    end_epoch = int(bars.index.max().timestamp())
    bounds = []
    cur = start_epoch
    while cur < end_epoch:
        nxt = session_open_epoch(cur + 90000)   # +25h always lands in the next session
        if nxt <= cur:
            break
        bounds.append((pd.Timestamp(cur, unit='s', tz='UTC'), pd.Timestamp(nxt, unit='s', tz='UTC')))
        cur = nxt
    return bounds


def daily_closes(bars: pd.DataFrame, bounds: list[tuple[pd.Timestamp, pd.Timestamp]]) -> list[float | None]:
    """Last close of each session, for the causal sigma proxy — None if a
    session has no bars (data gap/weekend)."""
    closes = []
    for s, e in bounds:
        w = bars.loc[s:e]
        closes.append(float(w['close'].iloc[-1]) if not w.empty else None)
    return closes


def sigma_proxy_series(closes: list[float | None], window: int = _SIGMA_WINDOW) -> list[float | None]:
    """Causal rolling realized vol (close-to-close log-return std) — a documented
    APPROXIMATION of the platform's YZ-30/GARCH/HV20, not a claim of bit-identical
    σ (see module docstring). sigma[i] uses only closes[0:i] — never look-ahead."""
    log_rets = []
    for i in range(1, len(closes)):
        a, b = closes[i - 1], closes[i]
        log_rets.append(np.log(b / a) if (a and b and a > 0 and b > 0) else None)
    out: list[float | None] = [None]   # day 0 has no history
    for i in range(1, len(closes)):
        window_rets = [r for r in log_rets[max(0, i - window):i] if r is not None]
        out.append(float(np.std(window_rets, ddof=1)) if len(window_rets) >= 5 else None)
    return out


@dataclass
class ReplayEntry:
    session_idx: int
    bar_idx: int
    direction: int
    entry_price: float
    bot_sl_dist: float
    bot_tp_dist: float
    decision: str   # fade | follow
    line: str


def replay_entries(pair: str, bars: pd.DataFrame, frac_k: dict, policy: dict) -> list[ReplayEntry]:
    """Walk every session's real M1 path through the bot's OWN decide(), exactly
    as the live loop does (catch_up-equivalent priming is unnecessary here since
    each session starts fresh from bar 0 — there is no "already running" state to
    prime away, unlike a live restart mid-session)."""
    bounds = session_bounds(bars)
    closes = daily_closes(bars, bounds)
    sigmas = sigma_proxy_series(closes)

    idx = bars.index
    entries: list[ReplayEntry] = []
    for s_i, (s_start, s_end) in enumerate(bounds):
        sigma = sigmas[s_i]
        if sigma is None or sigma <= 0:
            continue
        frac = {k: frac_k[k] * sigma for k in ('hl50', 'hl75', 'ocMed', 'oc75')}

        window = bars.loc[s_start:s_end]
        if window.empty:
            continue
        open_px = float(window['open'].iloc[0])
        tracker = SessionTracker(open_px)

        for ts, row in window.iterrows():
            hi, lo, cl = float(row['high']), float(row['low']), float(row['close'])
            tracker.on_price(hi)
            tracker.on_price(lo)
            tracker.on_minute(cl)
            specs = decide({**frac, 'sigma': sigma}, policy, tracker, cl, sigma=sigma)
            for spec in specs:
                direction = 1 if spec['side'] == 'buy' else -1
                bar_idx = idx.searchsorted(ts)
                entries.append(ReplayEntry(
                    session_idx=s_i, bar_idx=bar_idx, direction=direction,
                    entry_price=spec['entry'],
                    bot_sl_dist=abs(spec['entry'] - spec['sl']),
                    bot_tp_dist=abs(spec['tp'] - spec['entry']),
                    decision=spec['decision'], line=spec['line'],
                ))
    return entries


def resolve_available_pairs(plan: dict) -> list[str]:
    """Plan universe pairs that also have a cached M1 parquet locally."""
    return [p for p in plan['pairs'] if os.path.exists(os.path.join(_M1_DIR, f'{p}_m1.parquet'))]


def process_pair(pair: str, plan: dict, sl_mult_grid: list[float], tp_r_grid: list[float],
                 max_hours: float, verbose: bool = True) -> dict | None:
    p = plan['pairs'][pair]
    frac_k = {k: p[k] / p['sigma'] for k in ('hl50', 'hl75', 'ocMed', 'oc75')}
    ac = p.get('assetClass', 'fx')
    bars = load_m1(pair)
    if verbose:
        print(f"\n=== {pair} ({ac}) === {len(bars):,} M1 bars, {bars.index.min()} -> {bars.index.max()}")

    entries = replay_entries(pair, bars, frac_k, plan['policy'])
    cost = default_spread(pair)
    # Drop degenerate entries where the level geometry collapsed to a near-zero
    # SL distance (a sigma-proxy artifact — a session where the causal rolling
    # realized-vol proxy read near-zero, e.g. a very quiet EURCHF stretch,
    # shrinks every band toward the anchor until inner/outer levels almost
    # coincide). A stop tighter than the spread itself isn't a real trade; left
    # in, cost_price/sl blows up (one such entry can drag the whole average by
    # thousands of R) and silently corrupts every average below.
    n_before = len(entries)
    entries = [e for e in entries if e.bot_sl_dist > cost]
    n_degenerate = n_before - len(entries)
    if verbose:
        print(f"  real entries: {len(entries)}" +
              (f"  ({n_degenerate} degenerate sl<spread dropped)" if n_degenerate else ""))
    if not entries:
        return None

    by_decision: dict[str, int] = {}
    for e in entries:
        by_decision[e.decision] = by_decision.get(e.decision, 0) + 1

    mean_sl_dist = float(np.mean([e.bot_sl_dist for e in entries]))
    cost = default_spread(pair)
    max_bars_ahead = int(max_hours * 60)

    # Baseline: each entry walked with its OWN sl/tp (not a shared grid cell) —
    # what the bot's real adaptive exit actually scored.
    own_r, own_win, own_sl = [], 0, 0
    for e in entries:
        if e.bot_sl_dist <= 0:
            continue
        tp_r = e.bot_tp_dist / e.bot_sl_dist
        one = race_grid(bars, [Entry(idx=e.bar_idx, direction=e.direction, entry_price=e.entry_price)],
                        sl_grid=[e.bot_sl_dist], tp_r_grid=[tp_r],
                        max_bars_ahead=max_bars_ahead, cost_price=cost)
        if not one:
            continue
        own_r.append(one[0].avg_r)
        own_win += one[0].win_rate >= 0.999
        own_sl += one[0].sl_rate >= 0.999
    n_own = len(own_r)

    # Swept uniform grid across all real entries.
    sl_grid = [round(mean_sl_dist * m, 6) for m in sl_mult_grid]
    race_entries = [Entry(idx=e.bar_idx, direction=e.direction, entry_price=e.entry_price) for e in entries]
    grid_results = race_grid(bars, race_entries, sl_grid, tp_r_grid, max_bars_ahead, cost_price=cost)
    grid_rows = [{'sl_mult': round(r.sl / mean_sl_dist, 2), 'tp_r': r.tp_r, 'n': r.n,
                 'win_rate': round(r.win_rate, 3), 'sl_rate': round(r.sl_rate, 3),
                 'timeout_rate': round(r.timeout_rate, 3), 'avg_r': round(r.avg_r, 4)} for r in grid_results]
    best = max(grid_rows, key=lambda r: r['avg_r']) if grid_rows else None

    if verbose:
        own_avg = float(np.mean(own_r)) if n_own else None
        print(f"  own exit avg_r={own_avg:+.4f}R (n={n_own})  |  "
              f"best swept avg_r={best['avg_r']:+.4f}R (sl_mult={best['sl_mult']}, tp_r={best['tp_r']})" if best else "  no grid results")

    return {
        'pair': pair, 'asset_class': ac, 'n_entries': len(entries), 'by_decision': by_decision,
        'own_exit': {'n': n_own, 'avg_r': round(float(np.mean(own_r)), 4) if n_own else None,
                    'win_rate': round(own_win / n_own, 3) if n_own else None,
                    'sl_rate': round(own_sl / n_own, 3) if n_own else None,
                    'mean_sl_dist': round(mean_sl_dist, 6)},
        'grid': grid_rows,
        'best_grid': best,
    }


def main():
    ap = argparse.ArgumentParser(description="volatility_bot Layer 2: real entries, swept SL/TP grid")
    ap.add_argument('--pair', default='gold', help="Pair key, comma-separated list, or 'all'")
    ap.add_argument('--sl-mult-grid', default='0.5,0.75,1.0,1.25,1.5,2.0',
                    help='Multiples of the bot\'s own mean SL distance across its real entries')
    ap.add_argument('--tp-r-grid', default='1,1.5,2,3,4')
    ap.add_argument('--max-hours', type=float, default=48.0)
    ap.add_argument('--csv-out', default=None)
    ap.add_argument('--json-out', default=None, help='Dashboard-ready combined JSON (per-pair + grid)')
    args = ap.parse_args()

    plan = load_plan()
    print(f"Plan snapshot generated {plan.get('generatedAt', '?')}")

    if args.pair == 'all':
        pairs = resolve_available_pairs(plan)
    else:
        pairs = [a.strip() for a in args.pair.split(',') if a.strip()]
    missing = [p for p in pairs if p not in plan['pairs']]
    for m in missing:
        print(f"  skip {m}: not in plan universe")
    pairs = [p for p in pairs if p in plan['pairs']]
    print(f"Pairs ({len(pairs)}): {pairs}")

    sl_mult_grid = [float(x) for x in args.sl_mult_grid.split(',')]
    tp_r_grid = [float(x) for x in args.tp_r_grid.split(',')]

    import time
    t_start = time.time()
    per_pair = []
    csv_rows = []
    for i, pair in enumerate(pairs, 1):
        t0 = time.time()
        try:
            result = process_pair(pair, plan, sl_mult_grid, tp_r_grid, args.max_hours)
        except FileNotFoundError as e:
            print(f"\n=== {pair}: skipped ({e}) ===")
            continue
        elapsed = time.time() - t0
        if result is None:
            print(f"  {pair}: no entries fired — skipping ({elapsed:.0f}s)")
            continue
        per_pair.append(result)
        for row in result['grid']:
            csv_rows.append({'pair': pair, 'asset_class': result['asset_class'], **row})
        total_elapsed = time.time() - t_start
        print(f"  [{i}/{len(pairs)}] {pair} done in {elapsed:.0f}s "
              f"(total {total_elapsed/60:.1f}min, ~{total_elapsed/i*(len(pairs)-i)/60:.1f}min remaining)")

        # Checkpoint after EVERY pair — a killed/crashed run still leaves usable
        # partial results, and progress is visible on disk while it runs (never
        # again: a multi-hour job with nothing to show until it exits).
        if args.csv_out:
            pd.DataFrame(csv_rows).to_csv(args.csv_out, index=False)
        if args.json_out:
            with open(args.json_out, 'w') as f:
                json.dump({'generated_from_plan': plan.get('generatedAt'), 'per_pair': per_pair,
                          'partial': i < len(pairs)}, f)

    if not per_pair:
        print("No results.")
        return

    print(f"\n{'PAIR':<8}{'N':>6}{'OWN avg_r':>12}{'BEST swept':>12}{'sl_mult':>9}{'tp_r':>7}")
    for r in sorted(per_pair, key=lambda r: (r['own_exit']['avg_r'] or 0)):
        own = r['own_exit']['avg_r']
        best = r['best_grid']
        own_str = f'{own:+.3f}' if own is not None else 'n/a'
        best_avg_str = f'{best["avg_r"]:+.3f}' if best else 'n/a'
        sl_mult_str = str(best['sl_mult']) if best else ''
        tp_r_str = str(best['tp_r']) if best else ''
        print(f"{r['pair']:<8}{r['n_entries']:>6}{own_str:>12}{best_avg_str:>12}{sl_mult_str:>9}{tp_r_str:>7}")

    # Final checkpoint write already happened at the end of the loop (with
    # partial=False) — this just confirms the paths for the log.
    if args.csv_out:
        print(f"\nGrid CSV written -> {args.csv_out}")
    if args.json_out:
        print(f"Dashboard JSON written -> {args.json_out}")


if __name__ == '__main__':
    main()
