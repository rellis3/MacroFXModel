"""
MacroFX Backtester

Fetches historical journal entries from the dashboard (journal_replay_store KV)
and replays the pre_screen + module filter chain against MT5 historical bar data.

Usage:
    python backtest.py                        # all pairs, all history
    python backtest.py --pair EUR/USD         # single pair
    python backtest.py --days 365             # last N days only
    python backtest.py --tier balanced        # override tier for this run
    python backtest.py --output results.json  # save results to file

Requires MT5 to be installed and connected for historical bar data.
"""

import argparse
import json
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests

log = logging.getLogger(__name__)

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False
    log.warning('MetaTrader5 not installed — bar data unavailable, pre_screen will use fixed tolerances')

# Add bot/ to path so we can import bot modules
sys.path.insert(0, os.path.dirname(__file__))

from utils.indicators import compute_atr, compute_wt1, atr_to_tol_pips
from utils.config_helpers import resolve_min_stars, session_threshold_mult

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_journal_replay(base_url: str) -> dict:
    """Fetches journal_replay_store from dashboard KV."""
    try:
        resp = requests.get(f'{base_url}/api/kv/get?key=journal_replay_store', timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        log.error(f'Failed to fetch journal replay data: {exc}')
        return {}


def fetch_bars_at(pair: str, dt: datetime, count: int = 50):
    """Fetches count 5m bars ending at dt from MT5. Returns None if unavailable."""
    if not HAS_MT5:
        return None
    try:
        sym  = pair.replace('/', '')
        bars = mt5.copy_rates_from(sym, mt5.TIMEFRAME_M5, dt, count)
        if bars is not None and len(bars) >= 10:
            return bars
    except Exception as exc:
        log.debug(f'fetch_bars_at {pair} {dt}: {exc}')
    return None


# ── Pre-screen simulation ─────────────────────────────────────────────────────

def simulate_pre_screen(
    entry_price: float,
    entry_direction: str,
    entry_stars: int,
    pair: str,
    bars,
    exec_cfg: dict,
) -> tuple[int, float, float]:
    """
    Simulates pre_screen for a single historical entry.
    Returns (score 0-2, tol_pips, wt1).
    """
    min_stars   = resolve_min_stars(exec_cfg)
    bardir      = (exec_cfg.get('bardir') or 'auto').lower()
    wt_thresh   = exec_cfg.get('wtthreshold', 35)
    pip_size    = _PIP_SIZES.get(pair, 0.0001)

    if entry_stars < min_stars:
        return 0, 0.0, float('nan')

    # Compute ATR tolerance
    if bars is not None:
        atr      = compute_atr(bars)
        tol_pips = atr_to_tol_pips(atr, pip_size)
    else:
        tol_pips = exec_cfg.get('prox_pips', 8)

    # Condition 1: entry is within tolerance of itself — always true for exact entry replay
    # In live mode this checks live_price vs entry_price.
    # In backtest we check whether the bar's close was within tol of entry_price.
    if bars is not None:
        bar_close = float(bars[-1]['close'])
        in_prox   = abs(bar_close - entry_price) / pip_size <= tol_pips
    else:
        in_prox = True  # assume proximity was met if we have no bars

    if not in_prox:
        return 0, tol_pips, float('nan')

    score = 1

    # Condition 2: WT1 direction
    wt1 = compute_wt1(bars) if bars is not None else float('nan')

    import math
    if bardir == 'off' or math.isnan(wt1):
        score = 2
    else:
        wt1_significant = abs(wt1) >= wt_thresh
        if bardir == 'auto' and not wt1_significant:
            score = 2
        else:
            is_long  = entry_direction.lower() in ('long', 'buy')
            is_short = entry_direction.lower() in ('short', 'sell')
            if (is_long and wt1 > 0) or (is_short and wt1 < 0):
                score = 2

    return score, tol_pips, wt1


# ── Journal parsing ───────────────────────────────────────────────────────────

def parse_journal_entries(raw: dict, pair_filter: Optional[str], days: int) -> list[dict]:
    """
    Parses journal_replay_store structure into a flat list of trade records.

    Expected structure (from JS journal-app.js):
      { date_str: { pair: { levels: [...], outcomes: [...] } } }
      or
      { date_str: { pair: { win: n, loss: n, ... } } }

    We normalise to:
      { date, pair, direction, stars, price, sl, tp, outcome, win }
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records = []

    for date_str, day_obj in raw.items():
        if not isinstance(day_obj, dict):
            continue
        try:
            date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            try:
                date = datetime.strptime(date_str[:10], '%Y-%m-%d').replace(tzinfo=timezone.utc)
            except ValueError:
                continue

        if date < cutoff:
            continue

        for pair, pair_obj in day_obj.items():
            if pair_filter and pair != pair_filter:
                continue
            if not isinstance(pair_obj, dict):
                continue

            # Handle various storage formats
            outcomes = pair_obj.get('outcomes') or pair_obj.get('levels') or []
            if isinstance(outcomes, list):
                for rec in outcomes:
                    if not isinstance(rec, dict):
                        continue
                    records.append({
                        'date':      date,
                        'pair':      pair,
                        'direction': rec.get('direction', '?'),
                        'stars':     rec.get('stars') or rec.get('totalStars') or 0,
                        'price':     rec.get('price') or rec.get('entryPrice') or 0,
                        'sl':        rec.get('sl') or 0,
                        'tp':        rec.get('tp') or 0,
                        'outcome':   rec.get('outcome') or rec.get('result') or '?',
                        'win':       (rec.get('outcome') or rec.get('result') or '').lower() == 'win',
                        'pnl_r':     rec.get('pnlR') or rec.get('rMultiple') or None,
                    })
            elif isinstance(pair_obj, dict) and ('win' in pair_obj or 'loss' in pair_obj):
                # Aggregated format — create synthetic records
                for _ in range(int(pair_obj.get('win', 0))):
                    records.append({'date': date, 'pair': pair, 'direction': '?', 'stars': 0,
                                    'price': 0, 'sl': 0, 'tp': 0, 'outcome': 'win', 'win': True, 'pnl_r': None})
                for _ in range(int(pair_obj.get('loss', 0))):
                    records.append({'date': date, 'pair': pair, 'direction': '?', 'stars': 0,
                                    'price': 0, 'sl': 0, 'tp': 0, 'outcome': 'loss', 'win': False, 'pnl_r': None})

    return records


# ── Statistics ────────────────────────────────────────────────────────────────

def compute_stats(records: list[dict]) -> dict:
    total    = len(records)
    wins     = sum(1 for r in records if r['win'])
    losses   = total - wins
    win_rate = wins / total if total else 0

    pnl_rs   = [r['pnl_r'] for r in records if r.get('pnl_r') is not None]
    avg_r    = sum(pnl_rs) / len(pnl_rs) if pnl_rs else None
    total_r  = sum(pnl_rs) if pnl_rs else None

    # Running max DD in R
    running  = 0.0
    peak     = 0.0
    max_dd   = 0.0
    for r in (pnl_rs or []):
        running += r
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd

    return {
        'total':    total,
        'wins':     wins,
        'losses':   losses,
        'win_rate': round(win_rate * 100, 1),
        'avg_r':    round(avg_r, 3)   if avg_r    is not None else None,
        'total_r':  round(total_r, 2) if total_r  is not None else None,
        'max_dd_r': round(max_dd, 2),
    }


def compute_by_group(records: list[dict], key_fn) -> dict:
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        groups[key_fn(r)].append(r)
    return {k: compute_stats(v) for k, v in sorted(groups.items())}


# ── Main ──────────────────────────────────────────────────────────────────────

def run_backtest(
    base_url: str,
    pair_filter: Optional[str],
    days: int,
    exec_cfg: dict,
    output_file: Optional[str],
) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(message)s',
        datefmt='%H:%M:%S',
    )

    log.info(f'Fetching journal replay data from {base_url}…')
    raw = fetch_journal_replay(base_url)
    if not raw:
        log.error('No journal data returned — check dashboard URL and KV configuration')
        sys.exit(1)

    log.info(f'Parsing entries (filter: pair={pair_filter}, days={days})…')
    all_records = parse_journal_entries(raw, pair_filter, days)
    log.info(f'Found {len(all_records)} historical records')

    if not all_records:
        log.warning('No records match filters — nothing to backtest')
        return

    if HAS_MT5:
        log.info('Connecting to MT5 for historical bar data…')
        if not mt5.initialize():
            log.warning(f'MT5 initialize() failed: {mt5.last_error()} — bars unavailable')

    # Simulate pre_screen for each record
    pre_screen_results = []
    for i, rec in enumerate(all_records):
        if (i + 1) % 100 == 0:
            log.info(f'  Processing {i+1}/{len(all_records)}…')

        bars = fetch_bars_at(rec['pair'], rec['date']) if HAS_MT5 else None
        score, tol_pips, wt1 = simulate_pre_screen(
            entry_price    = rec.get('price', 0),
            entry_direction= rec.get('direction', 'long'),
            entry_stars    = rec.get('stars', 0),
            pair           = rec['pair'],
            bars           = bars,
            exec_cfg       = exec_cfg,
        )

        session_hour = rec['date'].hour
        threshold    = session_threshold_mult(rec['date'])

        pre_screen_results.append({
            **rec,
            'pre_screen_score': score,
            'tol_pips':         round(tol_pips, 2),
            'wt1':              round(wt1, 2) if wt1 == wt1 else None,
            'would_trade':      score >= 2,
            'session_mult':     threshold,
            'session_hour':     session_hour,
        })

    would_trade   = [r for r in pre_screen_results if r['would_trade']]
    would_skip    = [r for r in pre_screen_results if not r['would_trade']]

    log.info('')
    log.info('=' * 60)
    log.info('BACKTEST RESULTS')
    log.info('=' * 60)

    all_stats   = compute_stats(all_records)
    trade_stats = compute_stats(would_trade)
    skip_stats  = compute_stats(would_skip)

    def print_stats(label: str, stats: dict, n: int) -> None:
        log.info(f'\n{label}  (n={n})')
        log.info(f'  Win rate : {stats["win_rate"]}%')
        log.info(f'  Avg R    : {stats["avg_r"]}')
        log.info(f'  Total R  : {stats["total_r"]}')
        log.info(f'  Max DD R : {stats["max_dd_r"]}')

    print_stats('ALL signals (unfiltered)',   all_stats,   len(all_records))
    print_stats('PRE_SCREEN PASS (score=2)',  trade_stats, len(would_trade))
    print_stats('PRE_SCREEN SKIP (score<2)',  skip_stats,  len(would_skip))

    pass_rate = len(would_trade) / len(all_records) * 100 if all_records else 0
    log.info(f'\nPre-screen pass rate: {pass_rate:.1f}% of signals ({len(would_trade)}/{len(all_records)})')

    if trade_stats['win_rate'] and all_stats['win_rate']:
        improvement = trade_stats['win_rate'] - all_stats['win_rate']
        log.info(f'Win rate improvement from filter: {improvement:+.1f}pp')

    # By pair
    log.info('\n── By pair (pre_screen PASS only) ──')
    by_pair = compute_by_group(would_trade, lambda r: r['pair'])
    for pair, s in by_pair.items():
        log.info(f'  {pair:12s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    # By star rating
    log.info('\n── By star rating (pre_screen PASS only) ──')
    by_stars = compute_by_group(would_trade, lambda r: str(r['stars']) + '★')
    for stars, s in by_stars.items():
        log.info(f'  {stars:5s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    # By session hour
    log.info('\n── By session (pre_screen PASS only) ──')
    def session_label(r):
        h = r['session_hour']
        if 7 <= h < 12:  return 'London (07-12)'
        if 12 <= h < 17: return 'NY (12-17)'
        if 17 <= h < 22: return 'Late (17-22)'
        return 'Asian (22-07)'
    by_session = compute_by_group(would_trade, session_label)
    for sess, s in by_session.items():
        log.info(f'  {sess:20s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    if HAS_MT5:
        mt5.shutdown()

    results = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'config':        exec_cfg,
        'pair_filter':   pair_filter,
        'days':          days,
        'totals': {
            'all':         all_stats,
            'pass_filter': trade_stats,
            'skip_filter': skip_stats,
            'pass_rate_pct': round(pass_rate, 1),
        },
        'by_pair':    by_pair,
        'by_stars':   by_stars,
        'by_session': by_session,
    }

    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        log.info(f'\nResults saved to {output_file}')

    return results


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='MacroFX Backtester')
    ap.add_argument('--pair',     help='Filter to single pair e.g. EUR/USD')
    ap.add_argument('--days',     type=int, default=365*6, help='History depth in days (default: 6 years)')
    ap.add_argument('--tier',     default='balanced', help='Tier: strict|balanced|loose|aggressive')
    ap.add_argument('--bardir',   default='auto',     help='bardir: on|off|auto')
    ap.add_argument('--wt-thresh',type=int, default=35, help='WT1 significance threshold')
    ap.add_argument('--output',   help='Save results JSON to this file')
    ap.add_argument('--url',      default=os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app'))
    args = ap.parse_args()

    exec_cfg = {
        'tier':         args.tier,
        'bardir':       args.bardir,
        'wtthreshold':  args.wt_thresh,
        'min_stars':    3,
        'prox_pips':    8,
    }

    run_backtest(
        base_url    = args.url,
        pair_filter = args.pair,
        days        = args.days,
        exec_cfg    = exec_cfg,
        output_file = args.output,
    )
