"""
Fleet-wide trade-history backfill: for EVERY MT5 bot, connects to that bot's OWN
MT5 terminal + account (path/login pulled from its dashboard KV credentials),
pulls its closed-deal history straight from MT5, reconstructs round-trip trades
and pushes them into the dashboard's `trade_hist_<bot_key>_<date>` KV buckets
(bucketed by each trade's own close date) so they show up in bot-config.html ->
Positions -> Trade History.

This is the generalised sibling of `backfill_trade_history.py` (which only
handled the Backtest bot). Use it when you've closed trades in MetaTrader across
many bots and none are showing on the dashboard — the live status-push path only
records a close if the bot process was up and its KV push succeeded at that exact
moment; MT5's deal history has no such gap and is the authoritative catch-up source.

WHY PER-BOT CONNECT (the key design point)
  Each bot runs on its OWN MT5 account in its OWN MetaTrader installation, and its
  login + terminal PATH live in its own KV credentials blob
  (<bot>_credentials: mt5_account / mt5_password / mt5_server / mt5_path — saved
  from the bot-config page). So the script can't just read one terminal and split
  by magic (that only ever sees the bots sharing that one terminal — the original
  bug this rewrite fixes). Instead it walks the roster, connects to each bot's own
  terminal in turn, filters that account's deals by the bot's magic, and pushes.
  A side benefit: shared magics (20260005 GoldV2/RegimeV2, 20260099 Volatility/
  Backtest) can never cross-contaminate, because each bot is read from its own
  account.

WHERE TO RUN IT
  On a machine where the bots' MT5 terminals are installed (the MetaTrader5 Python
  package only works there). If your terminals are spread across several machines,
  run it on each — bots whose terminal isn't present just get skipped with a note.
  It is READ-ONLY against MT5 (history only) — it never sends an order, so it's
  safe to run while the live bots are running.

CREDENTIALS
  Read from the dashboard KV (needs --dashboard-url / $DASHBOARD_URL, which is also
  the push target). Each bot's login+path come from its <bot>_credentials key. A
  bot with no saved credentials (or unreachable terminal) is skipped, not failed.
  For a single bot with env-only creds (e.g. Gold V1) you can override with
  --only gold --path "C:\\...\\terminal64.exe" --account 123 --password ... --server ...

USAGE
  python backfill_all_bots.py --dry-run                        # inspect every bot, push nothing
  python backfill_all_bots.py                                  # backfill every bot, since --from
  python backfill_all_bots.py --only oi,gold                   # just these bots
  python backfill_all_bots.py --from 2026-06-01
  python backfill_all_bots.py --days 30
"""
import argparse
import json
import logging
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    from dotenv import load_dotenv
except ImportError:                              # dotenv is optional
    def load_dotenv(*_a, **_kw):
        return False

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(levelname)-7s  %(message)s', datefmt='%H:%M:%S')

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))


# ── Bot registry ──────────────────────────────────────────────────────────────
# name       : short handle for --only / logs
# magic      : the MT5 magic number the bot tags its trades with (pylego/magics.py)
# bot_key    : the dashboard status key -> trade_hist_<bot_key>_<date> bucket
# creds_key  : KV key holding this bot's MT5 login + terminal path
#
# Only bots the dashboard actually AGGREGATES into Trade History are listed (the
# 15 keys scanned by /api/trade-history in _worker.js). hedge/pos-hedge and the
# *_qmr bots are intentionally omitted — their live positions show, but the
# reader does not scan their history buckets, so a backfill wouldn't appear.
BOTS = [
    {'name': 'macrofx',        'magic': 20260001, 'bot_key': 'bot_status',              'creds_key': 'bot_credentials'},
    {'name': 'regime_v1',      'magic': 20260002, 'bot_key': 'regime_bot_status',       'creds_key': 'regime_bot_credentials'},
    {'name': 'gold',           'magic': 20260004, 'bot_key': 'gold_bot_status',         'creds_key': 'gold_bot_credentials'},
    {'name': 'gold_v2',        'magic': 20260005, 'bot_key': 'gold_v2_status',          'creds_key': 'gold_v2_credentials'},
    {'name': 'regime_v2',      'magic': 20260005, 'bot_key': 'regime_bot_v2_status',    'creds_key': 'regime_bot_v2_credentials'},
    {'name': 'confluence',     'magic': 20260006, 'bot_key': 'confluence_bot_status',   'creds_key': 'confluence_bot_credentials'},
    {'name': 'regime_v7',      'magic': 20260007, 'bot_key': 'regime_bot_v7_status',    'creds_key': 'regime_bot_v7_credentials'},
    {'name': 'dyn_anchor',     'magic': 20260009, 'bot_key': 'dyn_anchor_status',       'creds_key': 'dyn_anchor_credentials'},
    {'name': 'macro_equity',   'magic': 20260010, 'bot_key': 'macro_equity_bot_status', 'creds_key': 'macro_equity_credentials'},
    {'name': 'yield_spread',   'magic': 20260012, 'bot_key': 'yield_spread_status',     'creds_key': 'yield_spread_credentials'},
    {'name': 'volatility_ride', 'magic': 20260098, 'bot_key': 'volatility_ride_status', 'creds_key': 'volatility_ride_credentials'},
    {'name': 'volatility_bot', 'magic': 20260099, 'bot_key': 'volatility_bot_status',   'creds_key': 'volatility_bot_credentials'},
    {'name': 'backtest',       'magic': 20260099, 'bot_key': 'backtestsystem_status',   'creds_key': 'backtestsystem_credentials'},
    {'name': 'range_line',     'magic': 20260131, 'bot_key': 'range_line_bot_status',   'creds_key': 'range_line_bot_credentials'},
    {'name': 'oi',             'magic': 20260714, 'bot_key': 'oi_bot_status',           'creds_key': 'oi_bot_credentials'},
]


def _load_creds_from_kv(dashboard_url: str, creds_key: str) -> dict | None:
    """Fetch a bot's MT5 credentials from the dashboard KV API (mirrors the bots)."""
    try:
        url = f'{dashboard_url.rstrip("/")}/api/kv/get?key={creds_key}'
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read())
        if data.get('miss') or not data.get('data'):
            return None
        return data['data']
    except Exception as exc:
        log.warning(f'    KV read failed ({creds_key}): {exc}')
        return None


def _connect_bot(creds: dict) -> tuple[bool, str]:
    """Attach to the bot's own terminal + account. Shuts down any prior connection
    first (so we can switch terminals within one process). Verifies the connected
    account matches the credentials before returning True, so we never read one
    account's deals and push them under another bot's key.

    Returns (ok, message)."""
    import MetaTrader5 as mt5
    try:
        mt5.shutdown()
    except Exception:
        pass

    want_account = int(creds.get('mt5_account') or 0)
    password     = creds.get('mt5_password', '')
    server       = creds.get('mt5_server', '')
    path         = creds.get('mt5_path', '')

    kw: dict = {}
    if path:
        kw['path'] = path
    if want_account and password and server:
        kw.update({'login': want_account, 'password': password, 'server': server})

    if not mt5.initialize(**kw):
        return False, f'initialize() failed: {mt5.last_error()}'

    info = mt5.account_info()
    if info is None:
        return False, 'connected but account_info() is None'
    if want_account and int(info.login) != want_account:
        return False, (f'connected to account {info.login} but credentials say '
                       f'{want_account} — refusing (terminal on the wrong account?)')
    return True, f'account={info.login}  server={info.server}  balance={info.balance:.2f} {info.currency}'


def _fetch_deals(date_from: datetime, date_to: datetime, magic: int) -> list:
    import MetaTrader5 as mt5
    deals = mt5.history_deals_get(date_from, date_to)
    if not deals:
        return []
    return [d for d in deals if d.magic == magic]


def _build_trades(deals: list) -> tuple[list, int]:
    """Group deals (already filtered to one magic on one account) by position_id
    into round-trip trades. Volume-weights price across partial entries/exits.
    Skips positions with no IN+OUT pair in the window (still open, or entry
    predates the range). Same reconstruction as backfill_trade_history.py."""
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


def _push(dashboard_url: str, bot_key: str, trades: list) -> dict:
    payload = json.dumps({'bot_key': bot_key, 'trades': trades}).encode()
    req = urllib.request.Request(
        f'{dashboard_url.rstrip("/")}/api/trade-history/backfill',
        data=payload, headers={'Content-Type': 'application/json'}, method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='date_from', default='2026-05-01',
                    help='UTC date (YYYY-MM-DD) to backfill from (default: 2026-05-01)')
    ap.add_argument('--days', type=int, default=None, help='Backfill the last N days instead of --from')
    ap.add_argument('--only', default='', help='Comma-separated bot names or bot_keys to restrict to')
    ap.add_argument('--dashboard-url', default=os.getenv('DASHBOARD_URL', ''),
                    help='Dashboard base URL (else $DASHBOARD_URL) — used to READ creds and PUSH trades')
    ap.add_argument('--dry-run', action='store_true', help='Connect + reconstruct, but push nothing')
    # Single-bot manual credential override (for env-only bots, e.g. Gold V1):
    ap.add_argument('--path', default=None, help='Override MT5 terminal path (only valid with a single --only bot)')
    ap.add_argument('--account', type=int, default=None, help='Override MT5 account (with a single --only bot)')
    ap.add_argument('--password', default=None, help='Override MT5 password (with a single --only bot)')
    ap.add_argument('--server', default=None, help='Override MT5 server (with a single --only bot)')
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(',') if s.strip()}
    targets = [b for b in BOTS if not only or b['name'] in only or b['bot_key'] in only]
    if not targets:
        log.error('No bots matched --only. Registry names: ' + ', '.join(b['name'] for b in BOTS))
        sys.exit(1)

    manual_override = any(v is not None for v in (args.path, args.account, args.password, args.server))
    if manual_override and len(targets) != 1:
        log.error('--path/--account/--password/--server require exactly one --only bot.')
        sys.exit(1)

    dashboard_url = args.dashboard_url
    if not dashboard_url:
        log.error('No dashboard URL — set $DASHBOARD_URL or pass --dashboard-url '
                  '(needed to read each bot\'s KV credentials, and to push).')
        sys.exit(1)

    try:
        import MetaTrader5  # noqa: F401
    except ImportError:
        log.error('MetaTrader5 package not installed — run this on the machine with the MT5 terminals.')
        sys.exit(1)

    date_from = (datetime.now(timezone.utc) - timedelta(days=args.days)) if args.days \
        else datetime.strptime(args.date_from, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    date_to = datetime.now(timezone.utc) + timedelta(hours=1)
    log.info(f'Backfill window {date_from.date()} -> {date_to.date()}   ({len(targets)} bots)')

    summary = []          # (name, bot_key, status, n_trades, added)
    grand_added = 0

    for b in targets:
        label = f"{b['name']} [{b['bot_key']}] magic={b['magic']}"
        log.info(f'── {label} ' + '─' * max(0, 50 - len(label)))

        # Resolve credentials: manual override > KV
        if manual_override:
            creds = {
                'mt5_account':  args.account,
                'mt5_password': args.password,
                'mt5_server':   args.server,
                'mt5_path':     args.path,
            }
        else:
            creds = _load_creds_from_kv(dashboard_url, b['creds_key'])
        if not creds or not creds.get('mt5_account'):
            log.warning(f'    no MT5 credentials ({b["creds_key"]}) — skipped')
            summary.append((b['name'], b['bot_key'], 'no-creds', 0, 0))
            continue

        ok, msg = _connect_bot(creds)
        if not ok:
            log.warning(f'    connect skipped: {msg}')
            summary.append((b['name'], b['bot_key'], 'no-connect', 0, 0))
            continue
        log.info(f'    connected: {msg}')

        deals = _fetch_deals(date_from, date_to, b['magic'])
        trades, skipped = _build_trades(deals)
        if not trades:
            log.info(f'    {len(deals)} deals, 0 round-trip trades ({skipped} skipped) — nothing to push')
            summary.append((b['name'], b['bot_key'], 'empty', 0, 0))
            continue

        net = sum(t['profit'] + t['swap'] for t in trades)
        dates = sorted({datetime.fromtimestamp(t['time_close'], tz=timezone.utc).strftime('%Y-%m-%d') for t in trades})
        log.info(f'    {len(trades)} trades across {len(dates)} days '
                 f'({dates[0]} -> {dates[-1]})  net P&L: {net:+.2f}  ({skipped} skipped)')

        if args.dry_run:
            for t in trades[:3]:
                log.info(f'      sample: {t}')
            summary.append((b['name'], b['bot_key'], 'dry', len(trades), 0))
            continue

        try:
            result = _push(dashboard_url, b['bot_key'], trades)
            added = result.get('added', 0)
            grand_added += added
            log.info(f'    pushed -> {result}')
            summary.append((b['name'], b['bot_key'], 'ok', len(trades), added))
        except Exception as exc:
            log.error(f'    push failed: {exc}')
            summary.append((b['name'], b['bot_key'], 'push-err', len(trades), -1))

    try:
        import MetaTrader5 as mt5
        mt5.shutdown()
    except Exception:
        pass

    # ── Summary ────────────────────────────────────────────────────────────────
    log.info('═' * 78)
    log.info(f'{"BOT":<26}{"STATUS":<12}{"TRADES":>8}{"ADDED":>10}')
    for name, bot_key, status, n_trades, added in summary:
        added_s = 'DRY' if args.dry_run and status == 'dry' else ('ERR' if added < 0 else str(added))
        log.info(f'{name:<26}{status:<12}{n_trades:>8}{added_s:>10}')
    log.info('═' * 78)
    if args.dry_run:
        log.info('--dry-run: nothing pushed. Re-run without --dry-run to backfill.')
    else:
        log.info(f'Done — {grand_added} new trades added. Check Positions -> Trade History.')


if __name__ == '__main__':
    main()
