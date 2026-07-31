"""
One-off backfill: pulls closed-deal history for the Backtest bot (magic 20260099)
directly from MT5's own deal history and pushes it into the dashboard's
trade_hist_backtestsystem_status_<date> KV buckets (bucketed by each trade's own
close date), so it shows up in bot-config.html -> Positions -> Trade History.

Why this is needed: journal.py's in-memory record of closed trades is
incomplete — repeated KV load/push failures (403s, expired-cert SSL errors,
timeouts — see backtestSystem.log) combined with process restarts mean most
trades never had their close matched back to the open record. MT5's deal
history has no such gap; it's the authoritative source for this backfill.

Run this on the machine with the bot's MT5 terminal + .env (same credential
resolution as main.py: DASHBOARD_URL -> KV creds, else MT5_ACCOUNT/PASSWORD/
SERVER/PATH env vars).

Usage:
    python backfill_trade_history.py                       # since 2026-05-20 (bot's first day), live push
    python backfill_trade_history.py --from 2026-06-01 --dry-run
    python backfill_trade_history.py --days 30
"""
import argparse
import json
import logging
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
import mt5_utils

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(levelname)-7s  %(message)s', datefmt='%H:%M:%S')

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

MAGIC   = 20260099  # must match mt5_utils.get_open_positions() / place_order()
BOT_KEY = 'backtestsystem_status'


def _load_creds_from_kv(dashboard_url: str) -> dict | None:
    """Fetch backtestsystem_credentials from the dashboard KV API (mirrors main.py)."""
    try:
        url = f'{dashboard_url.rstrip("/")}/api/kv/get?key=backtestsystem_credentials'
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get('miss') or not data.get('data'):
            return None
        return data['data']
    except Exception as exc:
        log.warning(f'Could not load credentials from KV: {exc}')
        return None


def _connect() -> str:
    dashboard_url = os.getenv('DASHBOARD_URL', '')
    kv_creds = _load_creds_from_kv(dashboard_url) if dashboard_url else None
    if kv_creds:
        log.info('Loaded MT5 credentials from dashboard KV')
        account  = int(kv_creds.get('mt5_account') or 0)
        password = kv_creds.get('mt5_password', '')
        server   = kv_creds.get('mt5_server',   '')
        path     = kv_creds.get('mt5_path',     '')
    else:
        account  = int(os.getenv('MT5_ACCOUNT', '0'))
        password = os.getenv('MT5_PASSWORD', '')
        server   = os.getenv('MT5_SERVER', '')
        path     = os.getenv('MT5_PATH', '')
    if not mt5_utils.connect(account, password, server, path):
        log.error('MT5 connection failed — check .env and MT5 terminal')
        sys.exit(1)
    return dashboard_url


def _fetch_deals(date_from: datetime, date_to: datetime) -> list:
    import MetaTrader5 as mt5
    deals = mt5.history_deals_get(date_from, date_to)
    if not deals:
        return []
    return [d for d in deals if d.magic == MAGIC]


def _build_trades(deals: list) -> tuple[list, int]:
    """Group deals by position_id into round-trip trades. Volume-weights price
    across partial entries/exits. Skips positions with no matching IN+OUT pair
    in the queried window (still open, or truncated at the range edge)."""
    import MetaTrader5 as mt5
    by_position: dict = {}
    for d in deals:
        by_position.setdefault(d.position_id, []).append(d)

    trades, skipped = [], 0
    for position_id, group in by_position.items():
        entries = [d for d in group if d.entry == mt5.DEAL_ENTRY_IN]
        exits   = [d for d in group if d.entry == mt5.DEAL_ENTRY_OUT]
        if not entries or not exits:
            skipped += 1
            continue

        entry_vol = sum(d.volume for d in entries) or 1.0
        exit_vol  = sum(d.volume for d in exits) or 1.0
        open_price  = sum(d.price * d.volume for d in entries) / entry_vol
        close_price = sum(d.price * d.volume for d in exits) / exit_vol
        direction   = 'BUY' if entries[0].type == mt5.DEAL_TYPE_BUY else 'SELL'

        trades.append({
            'position_id': position_id,
            'symbol':      group[0].symbol,
            'direction':   direction,
            'lots':        round(entry_vol, 2),
            'open_price':  round(open_price, 5),
            'close_price': round(close_price, 5),
            'profit':      round(sum(d.profit for d in group), 2),
            'swap':        round(sum(d.swap for d in group), 2),
            'time_open':   int(min(d.time for d in entries)),
            'time_close':  int(max(d.time for d in exits)),
        })

    trades.sort(key=lambda t: t['time_close'])
    return trades, skipped


def _push(dashboard_url: str, trades: list) -> None:
    payload = json.dumps({'bot_key': BOT_KEY, 'trades': trades}).encode()
    req = urllib.request.Request(
        f'{dashboard_url.rstrip("/")}/api/trade-history/backfill',
        data=payload, headers={'Content-Type': 'application/json'}, method='POST',
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    log.info(f'Pushed: {result}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='date_from', default='2026-05-20',
                     help='UTC date (YYYY-MM-DD) to backfill from (default: 2026-05-20, the bot\'s first logged day)')
    ap.add_argument('--days', type=int, default=None, help='Backfill the last N days instead of --from')
    ap.add_argument('--dry-run', action='store_true', help='Print what would be pushed, without pushing')
    ap.add_argument('--out', default=None,
                    help='Write the reconstructed round-trip trades to this JSON file (LOCAL only — '
                         'no DASHBOARD_URL / push needed). For offline entry-quality analysis.')
    args = ap.parse_args()

    dashboard_url = _connect()
    if not dashboard_url and not args.dry_run and not args.out:
        log.error('DASHBOARD_URL not set — nothing to push to. Use --out FILE to save locally, '
                  'or --dry-run to inspect deals without pushing.')
        sys.exit(1)

    date_from = (datetime.now(timezone.utc) - timedelta(days=args.days)) if args.days \
        else datetime.strptime(args.date_from, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    date_to = datetime.now(timezone.utc) + timedelta(hours=1)

    log.info(f'Fetching MT5 deal history {date_from.date()} -> {date_to.date()}  magic={MAGIC}')
    deals = _fetch_deals(date_from, date_to)
    log.info(f'{len(deals)} raw deals with magic={MAGIC}')

    trades, skipped = _build_trades(deals)
    log.info(f'{len(trades)} closed round-trip trades reconstructed '
             f'({skipped} positions skipped — still open, or truncated at the range edge)')

    if not trades:
        log.info('Nothing to backfill.')
        return

    total_pnl = sum(t['profit'] + t['swap'] for t in trades)
    dates = sorted({datetime.fromtimestamp(t['time_close'], tz=timezone.utc).strftime('%Y-%m-%d') for t in trades})
    log.info(f'Date range: {dates[0]} -> {dates[-1]}  ({len(dates)} distinct days)  net P&L: {total_pnl:+.2f}')

    if args.out:
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(trades, fh, indent=2)
        log.info(f'Wrote {len(trades)} round-trip trades to {args.out} '
                 f'(local — nothing pushed to KV).')
        return

    if args.dry_run:
        log.info('--dry-run: not pushing. Sample trades:')
        for t in trades[:5]:
            log.info(f'  {t}')
        return

    _push(dashboard_url, trades)
    log.info('Done — check Positions -> Trade History (Backtest bot) on the dashboard.')


if __name__ == '__main__':
    main()
