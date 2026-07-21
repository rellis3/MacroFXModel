"""
Per-bot GIVE-BACK diagnostic — how much open profit each bot hands back.

The question this answers is the owner's: "we run massively in profit intraday
but end the day in loss — how, and how do I get out better, per bot?" That is an
EXIT-management question, and the honest way to measure it is the max-favourable-
excursion (MFE) vs the realised exit: for every closed trade, how far into profit
did price actually go (walking the REAL M1 high/low path, never a close-to-close
approximation — CLAUDE.md's MAE/MFE rule), and how much of that peak was given
back by the time the trade actually closed.

This generalises Gold/mfe_mae_analysis.py (whose walk_excursion / chandelier
replay this imports the shape of) to all four live bots, which store closed
trades four different ways:

  * gold        — Gold/logs/gold_journal.jsonl  (ENTRY_SIGNAL→TRADE_CLOSED join
                  by zone_id).  Has SL → give-back reported in R and pips.
  * confluence  — logs/confluence_<pair>_journal.jsonl (same join, by trade_id),
                  multi-instrument.  Has SL → R and pips.
  * range_line  — exported KV `range_line_trade_log` JSON (--trade-log FILE).
                  NO SL in the record → give-back reported in pips and $ only.
  * oi          — same KV shape as range_line (needs the OI rollup added in
                  server.js; until then export whatever oi_bot history exists).

M1 is the same R2 parquet cache the JS backtests read
(VolRangeForecaster/data/m1/<pair>_m1.parquet, via loadM1ForPair). A trade whose
window falls outside the local parquet's date coverage is SKIPPED and counted —
never silently dropped, never approximated (CLAUDE.md: data limits beat fake
productivity). Run it where fresh M1 + the KV export live for full coverage.

Usage:
  python analysis/bot_giveback.py --bot gold
  python analysis/bot_giveback.py --bot range_line --trade-log range_line_trade_log.json
  python analysis/bot_giveback.py --bot oi         --trade-log oi_trade_log.json
  python analysis/bot_giveback.py --bot confluence
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import statistics
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

M1_DIR = 'VolRangeForecaster/data/m1'

# pair → M1 parquet basename (the cache uses lowercased, slash-stripped keys;
# a few instruments have their own file names). Unknown pairs fall back to the
# lowercased symbol, and are skipped with a note if no parquet exists.
_M1_ALIAS = {
    'XAUUSD': 'gold', 'GOLD': 'gold', 'XAGUSD': 'silver',
    'US100': 'nq', 'NAS100': 'nq', 'USTEC': 'nq', 'US500': 'spx',
    'SPX500': 'spx', 'US30': 'dow', 'US2000': 'us2000',
}

# pip size per symbol for the pips view (price units per pip). FX majors 1e-4,
# JPY crosses 1e-2, metals/indices 1e-2 default. Only used to render a pips
# column — the R and $ views don't depend on it.
def pip_size(symbol: str) -> float:
    s = (symbol or '').upper()
    if s.endswith('JPY'):
        return 0.01
    if s in ('XAUUSD', 'GOLD', 'XAGUSD', 'SILVER'):
        return 0.01
    if s in _M1_ALIAS and _M1_ALIAS[s] in ('nq', 'spx', 'dow', 'us2000'):
        return 1.0
    return 0.0001


@dataclass
class Trade:
    pair: str
    direction: str                 # LONG | SHORT
    entry_time: datetime
    entry_price: float
    close_time: datetime
    close_price: float
    close_reason: str
    sl: Optional[float] = None     # None for range_line/oi (not in the KV record)
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    realized_profit: Optional[float] = None   # account currency, when known (KV log)
    lots: Optional[float] = None


def _parse_iso(ts: str) -> datetime:
    return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def _parse_epoch(sec) -> datetime:
    return datetime.fromtimestamp(int(sec), tz=timezone.utc)


# ── loaders ──────────────────────────────────────────────────────────────────

def load_journal_join(paths: list[str], pair_default: str, join_key: str) -> list[Trade]:
    """Join ENTRY_SIGNAL → TRADE_CLOSED per `join_key` (zone_id for gold,
    trade_id for confluence) in stream order. Shared by the two file-journal
    bots (Gold + Confluence use the cloned journal format)."""
    trades: list[Trade] = []
    open_by: dict[str, dict] = {}
    for path in paths:
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                etype = ev.get('type')
                key = ev.get(join_key)
                if key is None:
                    continue
                if etype == 'ENTRY_SIGNAL':
                    open_by[key] = ev
                elif etype == 'TRADE_CLOSED':
                    ent = open_by.pop(key, None)
                    if not ent:
                        continue
                    trades.append(Trade(
                        pair=ent.get('symbol', pair_default),
                        direction=ent['direction'],
                        entry_time=_parse_iso(ent['timestamp']),
                        entry_price=float(ent['entry_price']),
                        close_time=_parse_iso(ev['timestamp']),
                        close_price=float(ev['price']),
                        close_reason=ev.get('reason', ''),
                        sl=float(ent['sl']) if ent.get('sl') is not None else None,
                        tp1=float(ent['tp1']) if ent.get('tp1') is not None else None,
                        tp2=float(ent['tp2']) if ent.get('tp2') is not None else None,
                    ))
    return sorted(trades, key=lambda t: t.entry_time)


def load_gold() -> list[Trade]:
    return load_journal_join(
        ['Gold/logs/gold_journal.jsonl', 'logs/gold_journal.jsonl'],
        pair_default='XAUUSD', join_key='zone_id')


def load_confluence() -> list[Trade]:
    paths = sorted(glob.glob('logs/confluence_*_journal.jsonl'))
    return load_journal_join(paths, pair_default='', join_key='trade_id')


def load_kv_trade_log(path: str) -> list[Trade]:
    """range_line / oi: an exported `*_trade_log` KV array. Each item is the
    server-rollup shape (server.js _rlAccumulateTradeLog): position_id, symbol,
    direction BUY/SELL, open_price, close_price, profit, reason, time_open,
    time_close (epoch seconds). No SL → R-multiples are unavailable; give-back
    is reported in pips and $."""
    with open(path, encoding='utf-8') as f:
        raw = json.load(f)
    arr = raw.get('data', raw) if isinstance(raw, dict) else raw
    trades: list[Trade] = []
    for c in arr:
        if c.get('time_open') is None or c.get('time_close') is None:
            continue
        if c.get('open_price') is None or c.get('close_price') is None:
            continue
        d = str(c.get('direction', '')).upper()
        trades.append(Trade(
            pair=c.get('symbol', ''),
            direction='LONG' if d in ('BUY', 'LONG') else 'SHORT',
            entry_time=_parse_epoch(c['time_open']),
            entry_price=float(c['open_price']),
            close_time=_parse_epoch(c['time_close']),
            close_price=float(c['close_price']),
            close_reason=c.get('reason', ''),
            realized_profit=float(c['profit']) if c.get('profit') is not None else None,
            lots=float(c['lots']) if c.get('lots') is not None else None,
        ))
    return sorted(trades, key=lambda t: t.entry_time)


# ── M1 loading (per pair) ────────────────────────────────────────────────────

_m1_cache: dict[str, Optional[pd.DataFrame]] = {}


def load_m1(pair: str) -> Optional[pd.DataFrame]:
    key = _M1_ALIAS.get((pair or '').upper(), (pair or '').lower().replace('/', '').replace('_', ''))
    if key in _m1_cache:
        return _m1_cache[key]
    path = os.path.join(M1_DIR, f'{key}_m1.parquet')
    if not os.path.exists(path):
        _m1_cache[key] = None
        return None
    df = pd.read_parquet(path)
    ts_col = 'datetime' if 'datetime' in df.columns else ('time' if 'time' in df.columns else None)
    if ts_col:
        df[ts_col] = pd.to_datetime(df[ts_col], utc=True)
        df = df.set_index(ts_col)
    elif df.index.name in ('datetime', 'time'):
        df.index = pd.to_datetime(df.index, utc=True)
    else:
        _m1_cache[key] = None
        return None
    if df.index.tz is None:
        df.index = df.index.tz_localize('UTC')
    out = df[['open', 'high', 'low', 'close']].sort_index()
    _m1_cache[key] = out
    return out


# ── excursion walk (real M1 path — same math as Gold/mfe_mae_analysis.py) ─────

@dataclass
class Excursion:
    mfe: float = 0.0            # favourable, price units
    mae: float = 0.0           # adverse, price units (positive)
    mfe_after_close: float = 0.0


def walk_excursion(bars: pd.DataFrame, t: Trade) -> Optional[Excursion]:
    sign = 1.0 if t.direction == 'LONG' else -1.0
    window = bars.loc[t.entry_time:t.close_time]
    if window.empty:
        return None
    if sign > 0:
        mfe = float((window['high'] - t.entry_price).max())
        mae = float((t.entry_price - window['low']).max())
    else:
        mfe = float((t.entry_price - window['low']).max())
        mae = float((window['high'] - t.entry_price).max())
    ext_end = t.close_time + pd.Timedelta(hours=6)
    ext = bars.loc[t.close_time:ext_end]
    after = 0.0
    if not ext.empty:
        if sign > 0:
            after = max(float((ext['high'] - t.close_price).max()), 0.0)
        else:
            after = max(float((t.close_price - ext['low']).max()), 0.0)
    return Excursion(mfe=max(mfe, 0.0), mae=max(mae, 0.0), mfe_after_close=after)


def realized_price_move(t: Trade) -> float:
    """Signed favourable price captured at the actual close (can be negative)."""
    sign = 1.0 if t.direction == 'LONG' else -1.0
    return sign * (t.close_price - t.entry_price)


def dollars_per_price(t: Trade) -> Optional[float]:
    """Back out $/price-unit from the KV record's own profit & price move, so
    MFE can be expressed in the SAME dollars the bot realised — no pip-value
    table needed. None when the trade closed at its entry (can't divide)."""
    move = t.close_price - t.entry_price
    if t.realized_profit is None or abs(move) < 1e-12:
        return None
    return abs(t.realized_profit / move)


def pct(vals: list[float], p: float) -> float:
    if not vals:
        return 0.0
    if len(vals) < 2:
        return vals[0]
    return float(statistics.quantiles(vals, n=100, method='inclusive')[int(p) - 1])


# ── report ───────────────────────────────────────────────────────────────────

def run(bot: str, trade_log: Optional[str]) -> None:
    loaders = {
        'gold': load_gold,
        'confluence': load_confluence,
    }
    if bot in ('range_line', 'oi'):
        if not trade_log:
            print(f'--bot {bot} needs --trade-log FILE (an exported {bot}_trade_log KV array). '
                  f'Get it on Railway: /api/kv/get?key={"range_line_trade_log" if bot=="range_line" else "oi_bot_trade_log"}')
            return
        trades = load_kv_trade_log(trade_log)
    elif bot in loaders:
        trades = loaders[bot]()
    else:
        print(f'unknown bot {bot!r}'); return

    if not trades:
        print('No closed trades found for this bot.'); return
    print(f'{bot}: loaded {len(trades)} closed trades '
          f'({trades[0].entry_time.date()} -> {trades[-1].entry_time.date()})')

    rows = []
    skipped = 0
    skipped_pairs: dict[str, int] = {}
    for t in trades:
        bars = load_m1(t.pair)
        if bars is None:
            skipped += 1; skipped_pairs[t.pair] = skipped_pairs.get(t.pair, 0) + 1
            continue
        exc = walk_excursion(bars, t)
        if exc is None:
            skipped += 1; skipped_pairs[t.pair] = skipped_pairs.get(t.pair, 0) + 1
            continue
        pip = pip_size(t.pair)
        realized = realized_price_move(t)
        giveback = exc.mfe - realized                       # price units given back off the peak
        dpp = dollars_per_price(t)
        sl_dist = abs(t.entry_price - t.sl) if t.sl is not None else None
        row = {
            'time': t.entry_time, 'pair': t.pair, 'dir': t.direction, 'reason': t.close_reason,
            'mfe_pips': round(exc.mfe / pip, 1),
            'mae_pips': round(exc.mae / pip, 1),
            'realized_pips': round(realized / pip, 1),
            'giveback_pips': round(giveback / pip, 1),
            'giveback_frac': round(giveback / exc.mfe, 2) if exc.mfe > 1e-9 else 0.0,
            'after_close_pips': round(exc.mfe_after_close / pip, 1),
            # R (SL-normalised) — the honest unit for gold/confluence
            'mfe_r': round(exc.mfe / sl_dist, 3) if sl_dist else None,
            'realized_r': round(realized / sl_dist, 3) if sl_dist else None,
            'giveback_r': round(giveback / sl_dist, 3) if sl_dist else None,
            # $ (backed out of the KV record's own profit) — for range_line/oi
            'mfe_usd': round(exc.mfe * dpp, 2) if dpp else None,
            'realized_usd': round(t.realized_profit, 2) if t.realized_profit is not None else None,
            'giveback_usd': round(giveback * dpp, 2) if dpp else None,
        }
        rows.append(row)

    if skipped:
        detail = ', '.join(f'{p or "?"}:{n}' for p, n in sorted(skipped_pairs.items(), key=lambda kv: -kv[1]))
        print(f'  ({skipped} trades skipped - no local M1 coverage: {detail})')
    if not rows:
        print('  No trades had M1 coverage locally - run where fresh M1 lives (Railway/R2). '
              'Nothing to analyse.')
        return

    df = pd.DataFrame(rows)
    n = len(df)

    # Primary unit: R when SL is known (gold/confluence), else $ when profit is
    # known (range_line/oi KV log), else pips. One column set, honestly labelled.
    if df['mfe_r'].notna().all():
        u, mfe_c, real_c, gave_c, fmt = 'R', 'mfe_r', 'realized_r', 'giveback_r', '.2f'
    elif df['mfe_usd'].notna().all():
        u, mfe_c, real_c, gave_c, fmt = '$', 'mfe_usd', 'realized_usd', 'giveback_usd', '.0f'
    else:
        u, mfe_c, real_c, gave_c, fmt = 'pips', 'mfe_pips', 'realized_pips', 'giveback_pips', '.1f'

    print('\n' + '=' * 92)
    print(f'{"TIME":<17}{"PAIR":<8}{"DIR":<6}{"REASON":<9}'
          f'{"MFE("+u+")":>9}{"REAL("+u+")":>10}{"GAVE("+u+")":>10}{"GAVE%":>7}{"POST(p)":>9}')
    print('-' * 92)
    for r in rows:
        gv_pct = r['giveback_frac'] * 100
        print(f'{str(r["time"])[:16]:<17}{(r["pair"] or "?"):<8}{r["dir"]:<6}{r["reason"][:8]:<9}'
              f'{r[mfe_c]:>9{fmt}}{r[real_c]:>10{fmt}}{r[gave_c]:>10{fmt}}'
              f'{gv_pct:>6.0f}%{r["after_close_pips"]:>9.1f}')
    print('=' * 92)

    print(f'\nn={n}  ({"below" if n < 30 else "meets"} the CLAUDE.md >=30 floor - '
          f'{"a steer, not proof" if n < 30 else "one book, read as a diagnostic"})')

    winners = df[df[real_c] > 0]
    losers = df[df[real_c] <= 0]
    # "Got real green, then closed red": reached >=0.5R (or, no-SL, >0 with a
    # positive MFE) yet finished at/below breakeven - the give-back that stings.
    green_thresh = 0.5 if u == 'R' else 1e-9
    green_then_red = df[(df[mfe_c] >= green_thresh) & (df[real_c] <= 0)]

    print('\nGIVE-BACK (peak favourable move vs what the exit actually kept):')
    print(f'  median peak MFE reached : {df[mfe_c].median():{fmt}} {u}')
    print(f'  median kept at exit     : {df[real_c].median():{fmt}} {u}')
    print(f'  median given back       : {df[gave_c].median():{fmt}} {u} '
          f'({df["giveback_frac"].median()*100:.0f}% of peak)')
    print(f'  reached real green ({("+0.5R" if u=="R" else ">0")}) then closed <=breakeven: '
          f'{len(green_then_red)}/{n} trades')
    if u == '$':
        tot_mfe, tot_gb = df['mfe_usd'].sum(), df['giveback_usd'].sum()
        if tot_mfe:
            print(f'  total peak ${tot_mfe:,.0f} -> total given back ${tot_gb:,.0f} '
                  f'({tot_gb/tot_mfe*100:.0f}% of peak $ handed back)')

    print(f'\nMFE percentiles ({u}):')
    for p in (10, 25, 50, 75, 90):
        print(f'  p{p:<3} = {pct(df[mfe_c].tolist(), p):{fmt}}')

    # Winners vs losers give-back, kept separate (a loser can "give back" >100%
    # of its peak by going on to a loss - averaging them together is misleading).
    if len(winners):
        print(f'\nWinners (n={len(winners)}): median peak {winners[mfe_c].median():{fmt}}{u}, '
              f'kept {winners[real_c].median():{fmt}}{u}, gave back '
              f'{winners["giveback_frac"].median()*100:.0f}% of peak')
    if len(losers):
        print(f'Losers  (n={len(losers)}): median peak {losers[mfe_c].median():{fmt}}{u} before '
              f'reversing to a {losers[real_c].median():{fmt}}{u} loss '
              f'- these barely got green, an entry/stop signature, not a banking one'
              if losers[mfe_c].median() < (0.5 if u == 'R' else losers[mfe_c].median() + 1)
              else '')

    # Counterfactual: bank a fixed fraction of the (hindsight) peak.
    print('\nCounterfactual - "bank at X% of peak" vs the actual exit '
          '(same trades, real M1 path):')
    print(f'  actual exits          : total {df[real_c].sum():+{fmt}} {u}  '
          f'avg {df[real_c].mean():+{fmt}}')
    for frac in (0.5, 0.7, 0.9):
        banked = df.apply(lambda r: max(r[mfe_c] * frac, r[real_c])
                          if r[mfe_c] and r[mfe_c] > 0 else r[real_c], axis=1)
        print(f'  bank {int(frac*100)}% of peak MFE : total {banked.sum():+{fmt}} {u}  '
              f'avg {banked.mean():+{fmt}}')
    print('  (UPPER bound - assumes selling at a fixed fraction of a peak only visible in '
          'hindsight. Reads "is there room here", not "this is a strategy".)')

    winners_run = df[(df[real_c] > 0) & (df['after_close_pips'] > 0)]
    if len(winners_run):
        print(f'\nOf {len(winners)} winners, {len(winners_run)} kept running further after close '
              f'(median +{winners_run["after_close_pips"].median():.1f}p) - that is '
              f'"let winners run MORE", the opposite of banking earlier. Both are true; read both.')


def main():
    ap = argparse.ArgumentParser(description='Per-bot give-back (MFE vs realised) diagnostic')
    ap.add_argument('--bot', required=True, choices=['gold', 'confluence', 'range_line', 'oi'])
    ap.add_argument('--trade-log', help='exported KV *_trade_log JSON (range_line / oi)')
    args = ap.parse_args()
    run(args.bot, args.trade_log)


if __name__ == '__main__':
    main()
