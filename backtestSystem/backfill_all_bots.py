"""
Fleet-wide trade-history backfill: pulls closed-deal history for EVERY MT5 bot
straight from MT5's own deal history and pushes each bot's round trips into the
dashboard's `trade_hist_<bot_key>_<date>` KV buckets (bucketed by each trade's
own close date), so they show up in bot-config.html -> Positions -> Trade History.

This is the generalised sibling of `backfill_trade_history.py` (which only ever
handled the Backtest bot, magic 20260099). Use this when you've closed trades in
MetaTrader across many bots and none of them are showing on the dashboard — the
live status-push path only records a close if the bot process happened to be up
and its KV push succeeded at that exact moment; MT5's deal history has no such
gap and is the authoritative source for a catch-up backfill.

HOW IT WORKS
  1. Connects to the MT5 terminal on THIS machine (one terminal = one account).
  2. Pulls the whole deal history for the date range ONCE.
  3. Splits deals by their `magic` number (the per-bot tag) and reconstructs
     round-trip trades per bot.
  4. Maps each magic -> the bot's dashboard `bot_key` via the BOTS registry
     below, and POSTs each bot's trades to /api/trade-history/backfill.

WHERE TO RUN IT
  On the machine with the bot's MT5 terminal installed + logged in (the MetaTrader5
  Python package only works there). It will NOT run in the cloud sandbox.

MAGIC COLLISIONS (read this)
  Some bots deliberately share a magic because they normally run on SEPARATE MT5
  accounts / terminals:
     20260005  -> Gold V2  AND  Regime V2
     20260006  -> Confluence  (also Regime V4, which the dashboard doesn't aggregate)
     20260099  -> Volatility  AND  Backtest
  On any single terminal only ONE of a colliding pair is really trading, but the
  script can't know which — so by default it SKIPS a colliding magic and asks you
  to disambiguate. Resolve it either by naming the bot(s) actually on this
  terminal with `--only`, or by forcing the mapping with `--map`:
     python backfill_all_bots.py --only volatility_bot          # 20260099 -> volatility_bot_status
     python backfill_all_bots.py --map 20260099=backtestsystem_status

CREDENTIALS  (same resolution order as the bots)
  1. --creds-key <kv_key>  -> pull MT5 login from the dashboard KV (e.g.
     volatility_bot_credentials, gold_bot_credentials, backtestsystem_credentials).
  2. else MT5_ACCOUNT / MT5_PASSWORD / MT5_SERVER / MT5_PATH env vars (or .env).
  3. else a bare mt5.initialize() — works when the terminal is already open and
     logged into the right account (the common case).

USAGE
  python backfill_all_bots.py                                   # every unambiguous bot, since --from
  python backfill_all_bots.py --dry-run                         # inspect, push nothing
  python backfill_all_bots.py --only volatility_bot,gold_bot    # just these
  python backfill_all_bots.py --from 2026-06-01
  python backfill_all_bots.py --days 30
  python backfill_all_bots.py --map 20260099=backtestsystem_status
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

sys.path.insert(0, os.path.dirname(__file__))
import mt5_utils

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(levelname)-7s  %(message)s', datefmt='%H:%M:%S')

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))


# ── Bot registry ──────────────────────────────────────────────────────────────
# name       : short handle for --only / logs
# magic      : the MT5 magic number the bot tags its trades with (pylego/magics.py)
# bot_key    : the dashboard status key -> trade_hist_<bot_key>_<date> bucket
#
# Only bots the dashboard actually AGGREGATES into Trade History are listed (the
# 15 keys scanned by /api/trade-history in _worker.js). hedge/pos-hedge and the
# *_qmr bots are intentionally omitted — their live positions show, but the
# reader does not scan their history buckets, so a backfill wouldn't appear.
BOTS = [
    {'name': 'macrofx',        'magic': 20260001, 'bot_key': 'bot_status'},
    {'name': 'regime_v1',      'magic': 20260002, 'bot_key': 'regime_bot_status'},
    {'name': 'gold',           'magic': 20260004, 'bot_key': 'gold_bot_status'},
    {'name': 'gold_v2',        'magic': 20260005, 'bot_key': 'gold_v2_status'},        # ⚠ 20260005 also regime_v2
    {'name': 'regime_v2',      'magic': 20260005, 'bot_key': 'regime_bot_v2_status'},  # ⚠ 20260005 also gold_v2
    {'name': 'confluence',     'magic': 20260006, 'bot_key': 'confluence_bot_status'},  # ⚠ 20260006 also Regime V4 (not aggregated)
    {'name': 'regime_v7',      'magic': 20260007, 'bot_key': 'regime_bot_v7_status'},
    {'name': 'dyn_anchor',     'magic': 20260009, 'bot_key': 'dyn_anchor_status'},
    {'name': 'macro_equity',   'magic': 20260010, 'bot_key': 'macro_equity_bot_status'},
    {'name': 'yield_spread',   'magic': 20260012, 'bot_key': 'yield_spread_status'},
    {'name': 'volatility_ride', 'magic': 20260098, 'bot_key': 'volatility_ride_status'},
    {'name': 'volatility_bot', 'magic': 20260099, 'bot_key': 'volatility_bot_status'},  # ⚠ 20260099 also backtest
    {'name': 'backtest',       'magic': 20260099, 'bot_key': 'backtestsystem_status'},  # ⚠ 20260099 also volatility_bot
    {'name': 'range_line',     'magic': 20260131, 'bot_key': 'range_line_bot_status'},
    {'name': 'oi',             'magic': 20260714, 'bot_key': 'oi_bot_status'},
]


def _load_creds_from_kv(dashboard_url: str, creds_key: str) -> dict | None:
    """Fetch a bot's MT5 credentials from the dashboard KV API (mirrors main.py)."""
    try:
        url = f'{dashboard_url.rstrip("/")}/api/kv/get?key={creds_key}'
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read())
        if data.get('miss') or not data.get('data'):
            return None
        return data['data']
    except Exception as exc:
        log.warning(f'Could not load credentials from KV ({creds_key}): {exc}')
        return None


def _connect(dashboard_url: str, creds_key: str | None) -> None:
    account, password, server, path = 0, '', '', os.getenv('MT5_PATH', '')
    kv_creds = _load_creds_from_kv(dashboard_url, creds_key) if (creds_key and dashboard_url) else None
    if kv_creds:
        log.info(f'Loaded MT5 credentials from dashboard KV ({creds_key})')
        account  = int(kv_creds.get('mt5_account') or 0)
        password = kv_creds.get('mt5_password', '')
        server   = kv_creds.get('mt5_server',   '')
        path     = kv_creds.get('mt5_path',     '') or path
    elif os.getenv('MT5_ACCOUNT'):
        account  = int(os.getenv('MT5_ACCOUNT', '0'))
        password = os.getenv('MT5_PASSWORD', '')
        server   = os.getenv('MT5_SERVER', '')
        path     = os.getenv('MT5_PATH', '') or path
    else:
        log.info('No --creds-key and no MT5_ACCOUNT env — using bare initialize() '
                 '(terminal must already be open and logged in).')

    if not mt5_utils.connect(account, password, server, path):
        log.error('MT5 connection failed — is the terminal open/logged in? check --creds-key / .env')
        sys.exit(1)


def _fetch_deals(date_from: datetime, date_to: datetime) -> list:
    import MetaTrader5 as mt5
    deals = mt5.history_deals_get(date_from, date_to)
    return list(deals) if deals else []


def _build_trades(deals: list) -> tuple[list, int]:
    """Group deals (already filtered to a single magic) by position_id into
    round-trip trades. Volume-weights price across partial entries/exits. Skips
    positions with no matching IN+OUT pair in the window (still open, or the entry
    predates the range). Identical reconstruction to backfill_trade_history.py."""
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


def _resolve_targets(only: set[str], overrides: dict[int, str]) -> tuple[dict[int, dict], list[str]]:
    """Return (magic -> {bot_key, name}) for magics we can push unambiguously,
    plus a list of human-readable notes about skipped/collided magics.

    --only  narrows the registry to the named bots (by name OR bot_key) first —
            which is itself a way to break a collision.
    --map   forces magic -> bot_key, overriding everything (wins any collision)."""
    notes: list[str] = []
    candidates: dict[int, list[dict]] = {}
    for b in BOTS:
        if only and b['name'] not in only and b['bot_key'] not in only:
            continue
        candidates.setdefault(b['magic'], []).append(b)

    targets: dict[int, dict] = {}
    for magic, bots in candidates.items():
        if magic in overrides:
            targets[magic] = {'bot_key': overrides[magic], 'name': f'--map:{overrides[magic]}'}
        elif len(bots) == 1:
            targets[magic] = {'bot_key': bots[0]['bot_key'], 'name': bots[0]['name']}
        else:
            names = ', '.join(f"{b['name']} ({b['bot_key']})" for b in bots)
            notes.append(f'magic {magic}: COLLISION between {names} — skipped. '
                         f'Disambiguate with --only <name> or --map {magic}=<bot_key>.')
    # --map for a magic that --only filtered out (or isn't in the registry at all)
    for magic, bot_key in overrides.items():
        if magic not in targets:
            targets[magic] = {'bot_key': bot_key, 'name': f'--map:{bot_key}'}
    return targets, notes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='date_from', default='2026-05-01',
                    help='UTC date (YYYY-MM-DD) to backfill from (default: 2026-05-01)')
    ap.add_argument('--days', type=int, default=None, help='Backfill the last N days instead of --from')
    ap.add_argument('--only', default='', help='Comma-separated bot names or bot_keys to restrict to (also breaks collisions)')
    ap.add_argument('--map', dest='maps', action='append', default=[],
                    help='Force a magic->bot_key mapping, e.g. --map 20260099=backtestsystem_status (repeatable)')
    ap.add_argument('--creds-key', default=None, help='KV key to load MT5 creds from (e.g. gold_bot_credentials)')
    ap.add_argument('--dashboard-url', default=os.getenv('DASHBOARD_URL', ''), help='Dashboard base URL (else $DASHBOARD_URL)')
    ap.add_argument('--dry-run', action='store_true', help='Print what would be pushed, without pushing')
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(',') if s.strip()}
    overrides: dict[int, str] = {}
    for m in args.maps:
        if '=' not in m:
            log.error(f'--map expects MAGIC=bot_key, got: {m}'); sys.exit(1)
        magic_s, bot_key = m.split('=', 1)
        overrides[int(magic_s.strip())] = bot_key.strip()

    known_keys = {b['bot_key'] for b in BOTS}
    for bk in overrides.values():
        if bk not in known_keys:
            log.warning(f'--map target "{bk}" is not one of the dashboard-aggregated bot keys — '
                        f'it will be stored but may not appear in Trade History.')

    dashboard_url = args.dashboard_url
    if not dashboard_url and not args.dry_run:
        log.error('No dashboard URL — set $DASHBOARD_URL or pass --dashboard-url (or use --dry-run).')
        sys.exit(1)

    targets, notes = _resolve_targets(only, overrides)
    for n in notes:
        log.warning(n)
    if not targets:
        log.error('No bots to backfill (everything filtered out or collided). '
                  'Use --only or --map to pick bots. Registry names: '
                  + ', '.join(b['name'] for b in BOTS))
        sys.exit(1)

    _connect(dashboard_url, args.creds_key)

    date_from = (datetime.now(timezone.utc) - timedelta(days=args.days)) if args.days \
        else datetime.strptime(args.date_from, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    date_to = datetime.now(timezone.utc) + timedelta(hours=1)

    log.info(f'Fetching MT5 deal history {date_from.date()} -> {date_to.date()}  '
             f'for magics {sorted(targets)}')
    all_deals = _fetch_deals(date_from, date_to)
    log.info(f'{len(all_deals)} raw deals in range')

    # Split deals by magic once
    by_magic: dict[int, list] = {}
    for d in all_deals:
        if d.magic in targets:
            by_magic.setdefault(d.magic, []).append(d)

    summary = []
    grand_added = 0
    for magic, tgt in sorted(targets.items()):
        deals = by_magic.get(magic, [])
        trades, skipped = _build_trades(deals)
        label = f"{tgt['name']} [{tgt['bot_key']}] magic={magic}"
        if not trades:
            log.info(f'{label}: 0 round-trip trades ({len(deals)} deals, {skipped} skipped) — nothing to push')
            summary.append((label, 0, 0))
            continue

        net = sum(t['profit'] + t['swap'] for t in trades)
        dates = sorted({datetime.fromtimestamp(t['time_close'], tz=timezone.utc).strftime('%Y-%m-%d') for t in trades})
        log.info(f'{label}: {len(trades)} trades across {len(dates)} days '
                 f'({dates[0]} -> {dates[-1]})  net P&L: {net:+.2f}  ({skipped} skipped)')

        if args.dry_run:
            for t in trades[:3]:
                log.info(f'    sample: {t}')
            summary.append((label, len(trades), 0))
            continue

        try:
            result = _push(dashboard_url, tgt['bot_key'], trades)
            added = result.get('added', 0)
            grand_added += added
            log.info(f'    pushed -> {result}')
            summary.append((label, len(trades), added))
        except Exception as exc:
            log.error(f'    push failed for {tgt["bot_key"]}: {exc}')
            summary.append((label, len(trades), -1))

    # ── Summary ────────────────────────────────────────────────────────────────
    log.info('─' * 72)
    log.info(f'{"BOT":<48}{"TRADES":>8}{"ADDED":>10}')
    for label, n_trades, added in summary:
        added_s = 'DRY' if args.dry_run else ('ERR' if added < 0 else str(added))
        log.info(f'{label:<48}{n_trades:>8}{added_s:>10}')
    log.info('─' * 72)
    if args.dry_run:
        log.info('--dry-run: nothing pushed. Re-run without --dry-run to backfill.')
    else:
        log.info(f'Done — {grand_added} new trades added. '
                 f'Check Positions -> Trade History on the dashboard.')


if __name__ == '__main__':
    main()
