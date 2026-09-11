#!/usr/bin/env python3
"""backfill_sl_at_entry — attach the entry stop and R to closed-trade rows written
before 2026-09-11, from MT5 order history. Step 6 of LIVE_BACKTEST_ALIGNMENT.md.

    DASHBOARD_URL=https://... python scripts/backfill_sl_at_entry.py --bot fib_atlas_bot_status --days 90 [--dry-run]

Runs on a host with the MT5 terminal for that bot's account. Credentials come
from the bot's <bot>_credentials KV key via DASHBOARD_URL (same resolution as
the bots themselves), else MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER / MT5_PATH.

WHAT IT DOES. For every closed row in trade_hist_<bot>_<date> over the range,
asks MT5 for the position's order history and takes the EARLIEST order's
sl/tp — the same brick the live serialisers use (pylego/broker/stops.py), so
backfilled rows and live rows cannot disagree on what "entry stop" means.
Pushes the results to /api/trade-history/annotate, which merges them into the
existing rows without creating any and without overwriting a value a row
already has.

WHAT IT REPORTS, AND WHY THAT MATTERS. Not every position's order history is
still there, and not every entry order carried a stop (a bot that opened naked
and set the stop by modify left sl=0). Those rows keep r=null. The script
prints the recovery rate and the reasons — because a backfill that silently
drops the unrecoverable rows biases the survivors (the trades whose stop was
trailed are exactly the ones that go missing), which is REFERENCE_ENGINE_PLAYBOOK.md
§6.7 and LIVE_BACKTEST_ALIGNMENT.md T3. Look at the drop rate before trusting
any R-denominated statistic on the backfilled range.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pylego.broker.stops import entry_stop_from_orders, r_multiple  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('backfill_sl')

# bot status key -> credentials key. The four legacy bots use their own names.
CRED_KEY = {
    'bot_status': 'bot_credentials', 'gold_bot_status': 'gold_bot_credentials',
    'gold_v2_status': 'gold_v2_credentials', 'backtestsystem_status': 'backtestsystem_credentials',
}


def _get(url: str, timeout: int = 30):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def _post(url: str, payload: dict, timeout: int = 120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _connect(dashboard_url: str, bot_key: str):
    try:
        import MetaTrader5 as mt5  # noqa: WPS433
    except ImportError:
        log.error('MetaTrader5 package not available — run this on the MT5 host.')
        sys.exit(1)
    cred_key = CRED_KEY.get(bot_key, bot_key.replace('_status', '_credentials'))
    creds = None
    if dashboard_url:
        try:
            j = _get(f'{dashboard_url}/api/kv/get?key={cred_key}', timeout=10)
            creds = None if j.get('miss') else (j.get('data') or None)
        except Exception as exc:
            log.warning(f'Could not load {cred_key} from KV: {exc}')
    account = int((creds or {}).get('mt5_account') or os.getenv('MT5_ACCOUNT', '0') or 0)
    password = (creds or {}).get('mt5_password') or os.getenv('MT5_PASSWORD', '')
    server = (creds or {}).get('mt5_server') or os.getenv('MT5_SERVER', '')
    path = (creds or {}).get('mt5_path') or os.getenv('MT5_PATH', '')
    ok = mt5.initialize(path=path, login=account, password=password, server=server) if path else \
        mt5.initialize(login=account, password=password, server=server)
    if not ok:
        log.error(f'MT5 initialize failed: {mt5.last_error()}')
        sys.exit(1)
    log.info(f'MT5 connected · account {account} · {server}')
    return mt5


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bot', required=True, help='status key, e.g. fib_atlas_bot_status')
    ap.add_argument('--days', type=int, default=90, help='look back this many days (max 400)')
    ap.add_argument('--to', default=None, help='end date YYYY-MM-DD (default today UTC)')
    ap.add_argument('--dry-run', action='store_true', help='resolve stops and report, push nothing')
    args = ap.parse_args()

    dashboard_url = os.getenv('DASHBOARD_URL', '').rstrip('/')
    if not dashboard_url:
        log.error('DASHBOARD_URL not set')
        sys.exit(2)
    to = date.fromisoformat(args.to) if args.to else datetime.now(timezone.utc).date()
    frm = to - timedelta(days=min(args.days, 400) - 1)

    # 1. the rows that need a stop — fetched in the 90-day chunks the API allows
    rows: list[dict] = []
    cur = frm
    while cur <= to:
        end = min(cur + timedelta(days=89), to)
        j = _get(f'{dashboard_url}/api/trade-history?from={cur.isoformat()}&to={end.isoformat()}', timeout=120)
        rows += [t for t in j.get('trades', []) if t.get('bot_key') == args.bot]
        cur = end + timedelta(days=1)
    seen = set(); uniq = []
    for t in rows:
        pid = t.get('position_id')
        if pid is None or pid in seen:
            continue
        seen.add(pid); uniq.append(t)
    need = [t for t in uniq if t.get('sl_at_entry') is None]
    log.info(f'{args.bot}: {len(uniq)} closed rows {frm} → {to}; {len(need)} lack sl_at_entry')
    if not need:
        return

    # 2. MT5 order history, via the shared brick
    mt5 = _connect(dashboard_url, args.bot)
    ann, why = [], {'order': 0, 'naked_or_missing': 0, 'no_prices': 0}
    for t in need:
        pid = int(t['position_id'])
        sl, tp = entry_stop_from_orders(mt5, pid)
        if sl is None:
            why['naked_or_missing'] += 1
            continue
        op, cp = t.get('open_price'), t.get('close_price')
        r = r_multiple(op, cp, sl, t.get('direction') == 'BUY')
        if r is None:
            why['no_prices'] += 1
        why['order'] += 1
        ann.append({'position_id': pid, 'sl_at_entry': sl, 'tp_at_entry': tp, 'sl_source': 'order', 'r': r})
    mt5.shutdown()

    # 3. the population report — read this before trusting any R on this range
    n = len(need)
    log.info('RECOVERY: %d of %d rows (%.1f%%) have an entry stop in MT5 order history; %d do not '
             '(naked entry order, or history no longer held); %d recovered a stop but have no prices for R.',
             why['order'], n, why['order'] / n * 100, why['naked_or_missing'], why['no_prices'])
    if why['order'] / n < 0.8:
        log.warning('Under 80%% recovered. The unrecovered rows are NOT random — trailed/modified positions are '
                    'over-represented — so R statistics on this range are biased toward the survivors (T3).')
    if args.dry_run:
        for a in ann[:5]:
            log.info(f'  sample: {a}')
        log.info('dry run — nothing pushed')
        return
    if not ann:
        return
    res = _post(f'{dashboard_url}/api/trade-history/annotate',
                {'bot_key': args.bot, 'from': frm.isoformat(), 'to': to.isoformat(), 'annotations': ann})
    log.info(f'annotate: {res}')


if __name__ == '__main__':
    main()
