"""
MacroFX Backtester

Fetches historical journal entries from the dashboard (journal_replay_store KV)
and replays the pre_screen + module filter chain against MT5 historical bar data.

Usage:
    python backtest.py                          # all pairs, all history
    python backtest.py --pair EUR/USD           # single pair
    python backtest.py --days 365               # last N days only
    python backtest.py --tier balanced          # override tier for this run
    python backtest.py --output results.json    # save results to file
    python backtest.py --oos-days 90            # last 90 days = OOS, rest = IS
    python backtest.py --split-date 2025-01-01  # explicit IS/OOS boundary
    python backtest.py --mfe                    # enable MFE/holding-time via MT5 bars (slow)

Requires MT5 to be installed and connected for historical bar data.
"""

import argparse
import json
import logging
import math
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

sys.path.insert(0, os.path.dirname(__file__))

from utils.indicators import compute_atr, compute_wt1, atr_to_tol_pips
from utils.config_helpers import resolve_min_stars, session_threshold_mult

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}

# Maximum 5m bars to scan forward per trade for MFE (48h = 576 bars)
_MFE_SCAN_BARS = 576


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
    """Fetches count 5m bars ending at dt from MT5 (for indicators at entry)."""
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


def fetch_bars_forward(pair: str, dt: datetime, count: int = _MFE_SCAN_BARS):
    """Fetches count 5m bars starting from dt (for MFE / holding-time scan)."""
    if not HAS_MT5:
        return None
    try:
        sym = pair.replace('/', '')
        end = dt + timedelta(minutes=5 * count)
        bars = mt5.copy_rates_range(sym, mt5.TIMEFRAME_M5, dt, end)
        if bars is not None and len(bars) >= 2:
            return bars
    except Exception as exc:
        log.debug(f'fetch_bars_forward {pair} {dt}: {exc}')
    return None


# ── Regime helpers ────────────────────────────────────────────────────────────

def vol_regime_from_bars(bars, pair: str) -> str:
    """ATR-based local volatility classification from entry bars."""
    if bars is None or len(bars) < 10:
        return 'UNKNOWN'
    atr_pips = compute_atr(bars) / _PIP_SIZES.get(pair, 0.0001)
    if atr_pips < 5:
        return 'LOW_VOL'
    if atr_pips > 20:
        return 'HIGH_VOL'
    return 'NORMAL_VOL'


def trend_regime_from_bars(bars) -> str:
    """
    DM-ratio trend vs range classification over last 14 bars.
    DX = |+DM - -DM| / (+DM + -DM); >0.30 → TREND, else RANGE.
    """
    if bars is None or len(bars) < 15:
        return 'UNKNOWN'
    w   = bars[-14:]
    pdm = sum(max(float(w[i]['high']) - float(w[i-1]['high']), 0.0) for i in range(1, 14))
    ndm = sum(max(float(w[i-1]['low']) - float(w[i]['low']),  0.0) for i in range(1, 14))
    tot = pdm + ndm
    if tot == 0:
        return 'UNKNOWN'
    return 'TREND' if abs(pdm - ndm) / tot > 0.30 else 'RANGE'


def session_label(hour: int) -> str:
    if 7 <= hour < 12:  return 'London (07-12)'
    if 12 <= hour < 17: return 'NY (12-17)'
    if 17 <= hour < 22: return 'Late (17-22)'
    return 'Asian (22-07)'


# ── MFE / MAE / holding-time ──────────────────────────────────────────────────

def compute_mfe_and_holding(
    pair: str,
    entry_price: float,
    direction: str,
    sl: float,
    tp: float,
    bars_fwd,
) -> Optional[dict]:
    """
    Scans forward bars to compute:
      mfe_r        — max favourable excursion in R before exit
      mae_r        — max adverse excursion in R before exit
      holding_bars — number of 5m bars held
      exit_reason  — 'tp' | 'sl' | 'timeout'

    Returns None if bars or SL are unavailable / invalid.
    """
    if bars_fwd is None or len(bars_fwd) < 2:
        return None

    pip_size  = _PIP_SIZES.get(pair, 0.0001)
    is_long   = direction.lower() in ('long', 'buy')
    risk_pips = abs(entry_price - sl) / pip_size if sl else 0.0

    if risk_pips < 0.001:
        return None

    best_pips  = 0.0
    worst_pips = 0.0

    for i, bar in enumerate(bars_fwd):
        high = float(bar['high'])
        low  = float(bar['low'])

        if is_long:
            fav = (high - entry_price) / pip_size
            adv = (entry_price - low)  / pip_size
        else:
            fav = (entry_price - low)  / pip_size
            adv = (high - entry_price) / pip_size

        best_pips  = max(best_pips,  fav)
        worst_pips = max(worst_pips, adv)

        # Exit detection
        if is_long:
            if sl and low  <= sl: reason = 'sl'; break
            if tp and high >= tp: reason = 'tp'; break
        else:
            if sl and high >= sl: reason = 'sl'; break
            if tp and low  <= tp: reason = 'tp'; break
    else:
        reason = 'timeout'
        i = len(bars_fwd) - 1

    return {
        'mfe_r':        round(best_pips  / risk_pips, 3),
        'mae_r':        round(worst_pips / risk_pips, 3),
        'holding_bars': i + 1,
        'exit_reason':  reason,
    }


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
    min_stars = resolve_min_stars(exec_cfg)
    bardir    = (exec_cfg.get('bardir') or 'auto').lower()
    wt_thresh = exec_cfg.get('wtthreshold', 35)
    pip_size  = _PIP_SIZES.get(pair, 0.0001)

    if entry_stars < min_stars:
        return 0, 0.0, float('nan')

    if bars is not None:
        atr      = compute_atr(bars)
        tol_pips = atr_to_tol_pips(atr, pip_size)
    else:
        tol_pips = exec_cfg.get('prox_pips', 8)

    if bars is not None:
        bar_close = float(bars[-1]['close'])
        in_prox   = abs(bar_close - entry_price) / pip_size <= tol_pips
    else:
        in_prox = True

    if not in_prox:
        return 0, tol_pips, float('nan')

    score = 1
    wt1   = compute_wt1(bars) if bars is not None else float('nan')

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
    Parses journal_replay_store into a flat list of trade records.

    Expected structure:
      { date_str: { pair: { outcomes: [...] } } }

    Each outcome record normalised to:
      { date, pair, direction, stars, price, sl, tp, outcome, win, pnl_r,
        exit_time, exit_price, tp1 }
    """
    cutoff  = datetime.now(timezone.utc) - timedelta(days=days)
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

            outcomes = pair_obj.get('outcomes') or pair_obj.get('levels') or []
            if isinstance(outcomes, list):
                for rec in outcomes:
                    if not isinstance(rec, dict):
                        continue
                    records.append({
                        'date':       date,
                        'pair':       pair,
                        'direction':  rec.get('direction', '?'),
                        'stars':      rec.get('stars') or rec.get('totalStars') or 0,
                        'price':      rec.get('price') or rec.get('entryPrice') or 0,
                        'sl':         rec.get('sl') or 0,
                        'tp':         rec.get('tp') or 0,
                        'outcome':    rec.get('outcome') or rec.get('result') or '?',
                        'win':        (rec.get('outcome') or rec.get('result') or '').lower() == 'win',
                        'pnl_r':      rec.get('pnlR') or rec.get('rMultiple') or None,
                        'exit_time':  rec.get('exitTime') or rec.get('closeTime') or None,
                        'exit_price': rec.get('exitPrice') or rec.get('closePrice') or None,
                        'tp1':        rec.get('tp1') or None,
                    })
            elif isinstance(pair_obj, dict) and ('win' in pair_obj or 'loss' in pair_obj):
                # Aggregated format — synthetic records without detail
                for _ in range(int(pair_obj.get('win', 0))):
                    records.append({'date': date, 'pair': pair, 'direction': '?', 'stars': 0,
                                    'price': 0, 'sl': 0, 'tp': 0, 'outcome': 'win', 'win': True,
                                    'pnl_r': None, 'exit_time': None, 'exit_price': None, 'tp1': None})
                for _ in range(int(pair_obj.get('loss', 0))):
                    records.append({'date': date, 'pair': pair, 'direction': '?', 'stars': 0,
                                    'price': 0, 'sl': 0, 'tp': 0, 'outcome': 'loss', 'win': False,
                                    'pnl_r': None, 'exit_time': None, 'exit_price': None, 'tp1': None})

    return records


# ── Statistics ────────────────────────────────────────────────────────────────

def compute_stats(records: list[dict]) -> dict:
    total    = len(records)
    wins     = sum(1 for r in records if r['win'])
    losses   = total - wins
    win_rate = wins / total if total else 0

    pnl_rs  = [r['pnl_r'] for r in records if r.get('pnl_r') is not None]
    avg_r   = sum(pnl_rs) / len(pnl_rs) if pnl_rs else None
    total_r = sum(pnl_rs) if pnl_rs else None

    running = peak = max_dd = 0.0
    for r in (pnl_rs or []):
        running += r
        if running > peak: peak = running
        dd = peak - running
        if dd > max_dd: max_dd = dd

    return {
        'total':    total,
        'wins':     wins,
        'losses':   losses,
        'win_rate': round(win_rate * 100, 1),
        'avg_r':    round(avg_r, 3)   if avg_r   is not None else None,
        'total_r':  round(total_r, 2) if total_r is not None else None,
        'max_dd_r': round(max_dd, 2),
    }


def compute_by_group(records: list[dict], key_fn) -> dict:
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        groups[key_fn(r)].append(r)
    return {k: compute_stats(v) for k, v in sorted(groups.items())}


def compute_exit_distribution(records: list[dict]) -> dict:
    """
    Analyses exit quality.

    Returns:
      avg_winner_r         — mean R of winning trades
      avg_loser_r          — mean R of losing trades (negative)
      avg_theoretical_rr   — mean RR ratio from TP/SL geometry (proxy MFE)
      mfe_scan_available   — True if bar-scanned MFE fields are present
      avg_mfe_r_winners    — mean scanned MFE (R) for winning trades
      avg_mfe_r_losers     — mean scanned MFE (R) for losing trades (how far they went before reversing)
      avg_mfe_capture_pct  — mean (actual_R / mfe_R) × 100 for all trades with positive MFE
      exit_leak_r          — avg_mfe_r_winners - avg_winner_r  (R left on table)
      avg_hold_bars_all    — mean 5m bars held
      avg_hold_hours_all   — mean hours held
      avg_hold_bars_winners/ losers
      exit_reasons         — {'tp': n, 'sl': n, 'timeout': n}
    """
    winners = [r for r in records if r.get('win') and r.get('pnl_r') is not None]
    losers  = [r for r in records if not r.get('win') and r.get('pnl_r') is not None]

    avg_winner_r = sum(r['pnl_r'] for r in winners) / len(winners) if winners else None
    avg_loser_r  = sum(r['pnl_r'] for r in losers)  / len(losers)  if losers  else None

    # Theoretical RR from TP/SL geometry (available without MT5)
    rr_vals = []
    for r in records:
        price, sl, tp = r.get('price', 0), r.get('sl', 0), r.get('tp', 0)
        if price and sl and tp:
            pip = _PIP_SIZES.get(r['pair'], 0.0001)
            risk   = abs(price - sl) / pip
            reward = abs(tp - price) / pip
            if risk > 0.001:
                rr_vals.append(reward / risk)
    avg_theoretical_rr = sum(rr_vals) / len(rr_vals) if rr_vals else None

    # Bar-scanned MFE fields (only present if --mfe was used)
    mfe_recs      = [r for r in records if r.get('mfe_r') is not None]
    win_mfe_recs  = [r for r in mfe_recs if r.get('win')]
    loss_mfe_recs = [r for r in mfe_recs if not r.get('win')]

    avg_mfe_winners = (sum(r['mfe_r'] for r in win_mfe_recs)  / len(win_mfe_recs)  if win_mfe_recs  else None)
    avg_mfe_losers  = (sum(r['mfe_r'] for r in loss_mfe_recs) / len(loss_mfe_recs) if loss_mfe_recs else None)

    # MFE capture: how much of the MFE the exit actually captured
    cap_recs = [r for r in mfe_recs if r.get('mfe_r', 0) > 0 and r.get('pnl_r') is not None]
    capture_ratios = [r['pnl_r'] / r['mfe_r'] for r in cap_recs]
    avg_capture_pct = sum(capture_ratios) / len(capture_ratios) * 100 if capture_ratios else None

    # Holding time
    hold_recs      = [r for r in records if r.get('holding_bars') is not None]
    hold_winners   = [r for r in hold_recs if r.get('win')]
    hold_losers    = [r for r in hold_recs if not r.get('win')]

    avg_hold_all     = sum(r['holding_bars'] for r in hold_recs)    / len(hold_recs)    if hold_recs    else None
    avg_hold_winners = sum(r['holding_bars'] for r in hold_winners) / len(hold_winners) if hold_winners else None
    avg_hold_losers  = sum(r['holding_bars'] for r in hold_losers)  / len(hold_losers)  if hold_losers  else None

    exit_reasons: dict[str, int] = defaultdict(int)
    for r in hold_recs:
        exit_reasons[r.get('exit_reason', '?')] += 1

    result: dict = {
        'avg_winner_r':       round(avg_winner_r, 3)      if avg_winner_r      is not None else None,
        'avg_loser_r':        round(avg_loser_r,  3)      if avg_loser_r       is not None else None,
        'avg_theoretical_rr': round(avg_theoretical_rr,2) if avg_theoretical_rr is not None else None,
        'mfe_scan_available': len(mfe_recs) > 0,
    }

    if avg_mfe_winners is not None:
        result['avg_mfe_r_winners']   = round(avg_mfe_winners, 3)
        result['avg_mfe_r_losers']    = round(avg_mfe_losers, 3) if avg_mfe_losers is not None else None
        result['avg_mfe_capture_pct'] = round(avg_capture_pct, 1) if avg_capture_pct is not None else None
        if avg_winner_r is not None and avg_mfe_winners > 0:
            result['exit_leak_r'] = round(avg_mfe_winners - avg_winner_r, 3)

    if avg_hold_all is not None:
        result['avg_hold_bars_all']     = round(avg_hold_all, 1)
        result['avg_hold_hours_all']    = round(avg_hold_all * 5 / 60, 2)
        result['avg_hold_bars_winners'] = round(avg_hold_winners, 1) if avg_hold_winners is not None else None
        result['avg_hold_bars_losers']  = round(avg_hold_losers,  1) if avg_hold_losers  is not None else None
        result['exit_reasons']          = dict(exit_reasons)

    return result


# ── Formatting helpers ────────────────────────────────────────────────────────

def _fmt(val, decimals: int = 3, suffix: str = '') -> str:
    if val is None:
        return 'n/a'
    return f'{val:.{decimals}f}{suffix}'


def print_stats(label: str, stats: dict, n: int) -> None:
    log.info(f'\n{label}  (n={n})')
    log.info(f'  Win rate : {stats["win_rate"]}%')
    log.info(f'  Avg R    : {stats["avg_r"]}')
    log.info(f'  Total R  : {stats["total_r"]}')
    log.info(f'  Max DD R : {stats["max_dd_r"]}')


def print_exit_analysis(label: str, records: list[dict]) -> None:
    """Prints the exit distribution block for a given record set."""
    ed = compute_exit_distribution(records)

    log.info(f'\n── Exit distribution: {label} ──')
    log.info(f'  Avg winner R    : {_fmt(ed["avg_winner_r"])}')
    log.info(f'  Avg loser  R    : {_fmt(ed["avg_loser_r"])}')
    log.info(f'  Theoretical RR  : {_fmt(ed["avg_theoretical_rr"])}  (from TP/SL geometry)')

    if ed.get('mfe_scan_available'):
        log.info(f'  MFE winners (R) : {_fmt(ed.get("avg_mfe_r_winners"))}')
        log.info(f'  MFE losers  (R) : {_fmt(ed.get("avg_mfe_r_losers"))}  (how far losers got before reversing)')
        log.info(f'  MFE capture     : {_fmt(ed.get("avg_mfe_capture_pct"), 1, "%")}  (actual R / MFE)')
        exit_leak = ed.get('exit_leak_r')
        if exit_leak is not None:
            flag = '  ← EXIT LEAK CONFIRMED 💥' if exit_leak > 0.1 else ''
            log.info(f'  Exit leak (R)   : {_fmt(exit_leak)}{flag}')

    if ed.get('avg_hold_bars_all') is not None:
        log.info(f'  Avg hold (bars) : {ed["avg_hold_bars_all"]}  ({ed["avg_hold_hours_all"]}h)')
        log.info(f'    Winners       : {_fmt(ed.get("avg_hold_bars_winners"), 1)} bars')
        log.info(f'    Losers        : {_fmt(ed.get("avg_hold_bars_losers"),  1)} bars')
        if ed.get('exit_reasons'):
            reasons = '  '.join(f'{k}={v}' for k, v in sorted(ed['exit_reasons'].items()))
            log.info(f'  Exit reasons    : {reasons}')

    return ed


def print_is_oos_comparison(is_records: list[dict], oos_records: list[dict]) -> None:
    """Side-by-side IS vs OOS comparison of exit metrics."""
    if not is_records or not oos_records:
        return

    is_ed  = compute_exit_distribution(is_records)
    oos_ed = compute_exit_distribution(oos_records)

    log.info('\n── IS vs OOS exit comparison ──')
    log.info(f'  {"Metric":<30} {"IS":>10} {"OOS":>10}  {"Δ":>8}')
    log.info('  ' + '-' * 60)

    def row(name: str, is_val, oos_val, decimals: int = 3) -> None:
        is_s  = _fmt(is_val,  decimals)
        oos_s = _fmt(oos_val, decimals)
        if is_val is not None and oos_val is not None:
            delta = oos_val - is_val
            d_s   = f'{delta:+.{decimals}f}'
            flag  = '  ← DEGRADED' if delta < -0.1 else ''
        else:
            d_s, flag = 'n/a', ''
        log.info(f'  {name:<30} {is_s:>10} {oos_s:>10}  {d_s:>8}{flag}')

    is_stats  = compute_stats(is_records)
    oos_stats = compute_stats(oos_records)

    row('Win rate (%)',          is_stats['win_rate'],   oos_stats['win_rate'],   1)
    row('Avg R (all trades)',    is_stats['avg_r'],      oos_stats['avg_r'])
    row('Avg winner R',         is_ed['avg_winner_r'],  oos_ed['avg_winner_r'])
    row('Avg loser R',          is_ed['avg_loser_r'],   oos_ed['avg_loser_r'])
    row('Theoretical RR',       is_ed['avg_theoretical_rr'], oos_ed['avg_theoretical_rr'], 2)

    if is_ed.get('mfe_scan_available') and oos_ed.get('mfe_scan_available'):
        row('MFE winners (R)',   is_ed.get('avg_mfe_r_winners'),   oos_ed.get('avg_mfe_r_winners'))
        row('MFE capture (%)',   is_ed.get('avg_mfe_capture_pct'), oos_ed.get('avg_mfe_capture_pct'), 1)
        row('Exit leak (R)',     is_ed.get('exit_leak_r'),         oos_ed.get('exit_leak_r'))

    if is_ed.get('avg_hold_bars_all') is not None and oos_ed.get('avg_hold_bars_all') is not None:
        row('Avg hold (bars)',   is_ed['avg_hold_bars_all'],   oos_ed['avg_hold_bars_all'],   1)
        row('Avg hold winners',  is_ed.get('avg_hold_bars_winners'), oos_ed.get('avg_hold_bars_winners'), 1)
        oos_hold = oos_ed.get('avg_hold_bars_all', 0) or 0
        is_hold  = is_ed.get('avg_hold_bars_all',  0) or 0
        if oos_hold < is_hold * 0.8:
            log.info('  ⚠  OOS trades held significantly shorter → possible early shake-out')


# ── Main ──────────────────────────────────────────────────────────────────────

def run_backtest(
    base_url: str,
    pair_filter: Optional[str],
    days: int,
    exec_cfg: dict,
    output_file: Optional[str],
    oos_days: Optional[int] = None,
    split_date: Optional[datetime] = None,
    scan_mfe: bool = False,
) -> Optional[dict]:
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
        return None

    if HAS_MT5:
        log.info('Connecting to MT5 for historical bar data…')
        if not mt5.initialize():
            log.warning(f'MT5 initialize() failed: {mt5.last_error()} — bars unavailable')

    # IS/OOS boundary
    oos_cutoff: Optional[datetime] = None
    if split_date is not None:
        oos_cutoff = split_date if split_date.tzinfo else split_date.replace(tzinfo=timezone.utc)
    elif oos_days is not None:
        oos_cutoff = datetime.now(timezone.utc) - timedelta(days=oos_days)

    # ── Pre-screen + regime tagging pass ─────────────────────────────────────
    pre_screen_results = []
    for i, rec in enumerate(all_records):
        if (i + 1) % 100 == 0:
            log.info(f'  Processing {i+1}/{len(all_records)}…')

        bars = fetch_bars_at(rec['pair'], rec['date']) if HAS_MT5 else None
        score, tol_pips, wt1 = simulate_pre_screen(
            entry_price     = rec.get('price', 0),
            entry_direction = rec.get('direction', 'long'),
            entry_stars     = rec.get('stars', 0),
            pair            = rec['pair'],
            bars            = bars,
            exec_cfg        = exec_cfg,
        )

        session_hour = rec['date'].hour

        enriched = {
            **rec,
            'pre_screen_score': score,
            'tol_pips':         round(tol_pips, 2),
            'wt1':              round(wt1, 2) if wt1 == wt1 else None,
            'would_trade':      score >= 2,
            'session_mult':     session_threshold_mult(rec['date']),
            'session_hour':     session_hour,
            'session':          session_label(session_hour),
            'vol_regime':       vol_regime_from_bars(bars, rec['pair']),
            'trend_regime':     trend_regime_from_bars(bars),
            # IS/OOS tag
            'is_oos': ('OOS' if oos_cutoff and rec['date'] >= oos_cutoff else 'IS') if oos_cutoff else None,
        }

        # Optional MFE / holding-time scan
        if scan_mfe and HAS_MT5 and score >= 2:
            bars_fwd = fetch_bars_forward(rec['pair'], rec['date'])
            mfe_data = compute_mfe_and_holding(
                pair        = rec['pair'],
                entry_price = rec.get('price', 0),
                direction   = rec.get('direction', 'long'),
                sl          = rec.get('sl', 0),
                tp          = rec.get('tp', 0),
                bars_fwd    = bars_fwd,
            )
            if mfe_data:
                enriched.update(mfe_data)

        pre_screen_results.append(enriched)

    would_trade = [r for r in pre_screen_results if r['would_trade']]
    would_skip  = [r for r in pre_screen_results if not r['would_trade']]

    # ── Summary ───────────────────────────────────────────────────────────────
    log.info('')
    log.info('=' * 70)
    log.info('BACKTEST RESULTS')
    log.info('=' * 70)

    all_stats   = compute_stats(all_records)
    trade_stats = compute_stats(would_trade)
    skip_stats  = compute_stats(would_skip)

    print_stats('ALL signals (unfiltered)',   all_stats,   len(all_records))
    print_stats('PRE_SCREEN PASS (score=2)',  trade_stats, len(would_trade))
    print_stats('PRE_SCREEN SKIP (score<2)',  skip_stats,  len(would_skip))

    pass_rate = len(would_trade) / len(all_records) * 100 if all_records else 0
    log.info(f'\nPre-screen pass rate: {pass_rate:.1f}% ({len(would_trade)}/{len(all_records)})')
    if trade_stats['win_rate'] and all_stats['win_rate']:
        log.info(f'Win rate lift from filter: {trade_stats["win_rate"] - all_stats["win_rate"]:+.1f}pp')

    # ── By pair ───────────────────────────────────────────────────────────────
    log.info('\n── By pair (pre_screen PASS) ──')
    by_pair = compute_by_group(would_trade, lambda r: r['pair'])
    for pair, s in by_pair.items():
        log.info(f'  {pair:12s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    # ── By star rating ────────────────────────────────────────────────────────
    log.info('\n── By star rating (pre_screen PASS) ──')
    by_stars = compute_by_group(would_trade, lambda r: str(r['stars']) + '★')
    for stars, s in by_stars.items():
        log.info(f'  {stars:5s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    # ── By session ────────────────────────────────────────────────────────────
    log.info('\n── By session (pre_screen PASS) ──')
    by_session = compute_by_group(would_trade, lambda r: r['session'])
    for sess, s in by_session.items():
        log.info(f'  {sess:20s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  avgR={s["avg_r"]}')

    # ═══════════════════════════════════════════════════════════════════════════
    # EXIT DISTRIBUTION ANALYSIS
    # ═══════════════════════════════════════════════════════════════════════════
    log.info('')
    log.info('=' * 70)
    log.info('EXIT DISTRIBUTION ANALYSIS  (pre_screen PASS trades)')
    log.info('=' * 70)

    # IS/OOS split if a boundary was set
    if oos_cutoff and any(r['is_oos'] == 'OOS' for r in would_trade):
        is_records  = [r for r in would_trade if r['is_oos'] == 'IS']
        oos_records = [r for r in would_trade if r['is_oos'] == 'OOS']

        log.info(f'\nIS  period: before {oos_cutoff.date()}  (n={len(is_records)})')
        log.info(f'OOS period: from   {oos_cutoff.date()}  (n={len(oos_records)})')

        is_ed  = print_exit_analysis('IS  (in-sample)',    is_records)
        oos_ed = print_exit_analysis('OOS (out-of-sample)', oos_records)
        print_is_oos_comparison(is_records, oos_records)
    else:
        is_records  = would_trade
        oos_records = []
        is_ed       = print_exit_analysis('All traded signals', would_trade)
        oos_ed      = {}

    # ═══════════════════════════════════════════════════════════════════════════
    # TIME-IN-TRADE
    # ═══════════════════════════════════════════════════════════════════════════
    hold_recs = [r for r in would_trade if r.get('holding_bars') is not None]
    if hold_recs:
        log.info('')
        log.info('=' * 70)
        log.info('TIME-IN-TRADE  (from MT5 bar scan)')
        log.info('=' * 70)

        def _hold_block(label: str, recs: list[dict]) -> None:
            hr = [r for r in recs if r.get('holding_bars') is not None]
            if not hr:
                return
            w = [r for r in hr if r.get('win')]
            l = [r for r in hr if not r.get('win')]
            avg_all  = sum(r['holding_bars'] for r in hr) / len(hr)
            avg_w    = sum(r['holding_bars'] for r in w)  / len(w)  if w else None
            avg_l    = sum(r['holding_bars'] for r in l)  / len(l)  if l else None
            log.info(f'\n  {label}  (n={len(hr)})')
            log.info(f'    All     : {avg_all:.1f} bars  ({avg_all*5/60:.1f}h)')
            if avg_w: log.info(f'    Winners : {avg_w:.1f} bars  ({avg_w*5/60:.1f}h)')
            if avg_l: log.info(f'    Losers  : {avg_l:.1f} bars  ({avg_l*5/60:.1f}h)')

        if oos_cutoff and oos_records:
            _hold_block('IS',  is_records)
            _hold_block('OOS', oos_records)
            is_hold  = sum(r['holding_bars'] for r in is_records  if r.get('holding_bars')) / max(len([r for r in is_records  if r.get('holding_bars')]), 1)
            oos_hold = sum(r['holding_bars'] for r in oos_records if r.get('holding_bars')) / max(len([r for r in oos_records if r.get('holding_bars')]), 1)
            if oos_hold < is_hold * 0.8:
                log.info('\n  ⚠  OOS trades held much shorter — possible early shake-out or changed market structure')
        else:
            _hold_block('All signals', would_trade)
    elif scan_mfe:
        log.info('\n  (No holding-time data — MFE scan found no valid SL/TP records)')

    # ═══════════════════════════════════════════════════════════════════════════
    # REGIME BREAKDOWN
    # ═══════════════════════════════════════════════════════════════════════════
    log.info('')
    log.info('=' * 70)
    log.info('REGIME BREAKDOWN  (pre_screen PASS trades)')
    log.info('=' * 70)

    def _regime_block(label: str, recs: list[dict], key: str) -> dict:
        log.info(f'\n── {label} ──')
        groups = compute_by_group(recs, lambda r: r.get(key, 'UNKNOWN'))
        for regime, s in groups.items():
            avg_r_str = f'avgR={s["avg_r"]}' if s['avg_r'] is not None else 'avgR=n/a'
            flag = '  ← DRAG' if s['avg_r'] is not None and s['avg_r'] < 0 else ''
            log.info(f'  {regime:20s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  {avg_r_str}{flag}')
        return groups

    by_trend   = _regime_block('Trend vs Range',       would_trade, 'trend_regime')
    by_vol     = _regime_block('Volatility Regime',    would_trade, 'vol_regime')
    by_session = _regime_block('Session',              would_trade, 'session')

    # Per-session + regime cross-tab (highlights the worst regime × session combo)
    worst_combo = None
    worst_avg_r = float('inf')
    for r in would_trade:
        key = f'{r.get("session","?")} × {r.get("trend_regime","?")}'
        # collect into groups for cross-tab
    cross_groups: dict[str, list] = defaultdict(list)
    for r in would_trade:
        cross_groups[f'{r.get("session","?")} × {r.get("trend_regime","?")}'].append(r)

    cross_stats = {k: compute_stats(v) for k, v in sorted(cross_groups.items()) if len(v) >= 5}
    if cross_stats:
        log.info('\n── Session × Trend cross-tab (≥5 trades) ──')
        for combo, s in sorted(cross_stats.items(), key=lambda x: (x[1]['avg_r'] or 0)):
            avg_r_str = f'avgR={s["avg_r"]}' if s['avg_r'] is not None else 'avgR=n/a'
            flag = '  ← WORST COMBO' if s['avg_r'] is not None and s['avg_r'] < 0 else ''
            log.info(f'  {combo:40s}  n={s["total"]:3d}  WR={s["win_rate"]:5.1f}%  {avg_r_str}{flag}')

    if HAS_MT5:
        mt5.shutdown()

    # ── Save results ──────────────────────────────────────────────────────────
    results = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'config':        exec_cfg,
        'pair_filter':   pair_filter,
        'days':          days,
        'oos_cutoff':    oos_cutoff.isoformat() if oos_cutoff else None,
        'scan_mfe':      scan_mfe,
        'totals': {
            'all':            all_stats,
            'pass_filter':    trade_stats,
            'skip_filter':    skip_stats,
            'pass_rate_pct':  round(pass_rate, 1),
        },
        'exit_distribution': {
            'all':  is_ed,
            'oos':  oos_ed,
        },
        'by_pair':         by_pair,
        'by_stars':        by_stars,
        'by_session':      by_session,
        'by_trend_regime': by_trend,
        'by_vol_regime':   by_vol,
        'session_x_trend': cross_stats,
    }

    if output_file:
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        log.info(f'\nResults saved to {output_file}')

    return results


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='MacroFX Backtester')
    ap.add_argument('--pair',       help='Filter to single pair e.g. EUR/USD')
    ap.add_argument('--days',       type=int, default=365*6, help='History depth in days (default: 6 years)')
    ap.add_argument('--tier',       default='balanced', help='Tier: strict|balanced|loose|aggressive')
    ap.add_argument('--bardir',     default='auto',     help='bardir: on|off|auto')
    ap.add_argument('--wt-thresh',  type=int, default=35, help='WT1 significance threshold')
    ap.add_argument('--output',     help='Save results JSON to this file')
    ap.add_argument('--url',        default=os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app'))
    ap.add_argument('--oos-days',   type=int, help='Last N days = OOS; rest = IS (e.g. 90)')
    ap.add_argument('--split-date', help='Explicit IS/OOS boundary (YYYY-MM-DD)')
    ap.add_argument('--mfe',        action='store_true', help='Enable MFE/holding-time scan via MT5 (slow)')
    args = ap.parse_args()

    exec_cfg = {
        'tier':        args.tier,
        'bardir':      args.bardir,
        'wtthreshold': args.wt_thresh,
        'min_stars':   3,
        'prox_pips':   8,
    }

    split_dt = None
    if args.split_date:
        try:
            split_dt = datetime.strptime(args.split_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except ValueError:
            ap.error(f'--split-date must be YYYY-MM-DD, got: {args.split_date}')

    run_backtest(
        base_url    = args.url,
        pair_filter = args.pair,
        days        = args.days,
        exec_cfg    = exec_cfg,
        output_file = args.output,
        oos_days    = args.oos_days,
        split_date  = split_dt,
        scan_mfe    = args.mfe,
    )
