#!/usr/bin/env python3
"""verify_motif_live_vs_backtest.py — reconciles motif_bot's REAL MT5 fills
against AnalogML/motif_track.py's continuously-updated forward-tracked signal
log (motif_trades.json), so "does live trade the same as the backtest" has an
actual answer instead of an assumption. The whole reason a backtest exists is
that the live account is supposed to reproduce it -- this checks that it does.

MUST RUN ON THE MACHINE WITH THE BOT'S MT5 TERMINAL open + logged in (same
requirement as motif_bot.py itself) and network to the dashboard. This cannot
be run from a sandbox: MT5's own deal history only exists in the terminal
process, and the dashboard's generic KV API is not reachable from outside the
account's own network in this project's setup.

Three data sources, three different clocks -- get this wrong and every
comparison is off by hours:
  1. MT5 deal history (this bot's magic, 20260916) -- the REAL fills.
     Timestamps are on the BROKER's wall clock, not UTC (pylego.broker.clock
     — a hardcoded assumption here is exactly what made analysis/
     trade_analyzer.py silently an hour wrong all summer).
  2. motif_bot_decision_log (dashboard KV) -- the bot's own "entered" events,
     each carrying the motif_key a raw MT5 fill can't: the order comment is a
     short deterministic hash since the 2026-09-18 comment-length fix
     (_position_comment in motif_bot.py), not the motif_key itself. Real UTC
     timestamps (int(time.time()) at decision time).
  3. motif_trades.json (dashboard's /api/analogml/motif-trades, R2-backed) --
     the touch-motif signal's own forward-tracked record, raced by the SAME
     pylego.barrier_race code the backtest uses, extended hourly by
     motif_track.py's Railway cron. This IS "the backtest, kept current."

For each live trade this reports one of:
  MATCH        — backtest confirms the same motif, same direction, same
                 tp/sl outcome (or is still open on both sides).
  DIVERGENCE   — direction or outcome disagree, or the motif isn't in the
                 backtest's log at all. Investigate; this is the failure
                 mode the whole exercise exists to catch.
  UNRESOLVED   — matched to a motif_key that the backtest hasn't finished
                 racing yet (still `open` there). Not a disagreement, just
                 not decidable yet -- re-run later.
  UNMATCHED    — a real MT5 fill with no decision-log "entered" event close
                 enough in pair/direction/time to identify which motif it
                 was. Rare; usually means decision_log rolled the event off
                 its cap, or the bot was mid-restart when it fired.

Out of scope (would need M1 bars + AnalogML.motif_features on this machine,
which a pure execution box typically doesn't have): checking whether
best-config SHOULD have offered a motif the live bot never saw at all. This
only reconciles what the bot actually acted on / logged.

Usage:
    python scripts/verify_motif_live_vs_backtest.py --url <dashboard-url>
    python scripts/verify_motif_live_vs_backtest.py --url <dashboard-url> --since 2026-09-16
    python scripts/verify_motif_live_vs_backtest.py --url <dashboard-url> --mt5-path "C:\\...\\terminal64.exe"
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pylego.broker.clock import ServerClock  # noqa: E402
from pylego.instruments import resolve_key  # noqa: E402

MAGIC = 20260916  # motif_bot/motif_bot.py, pylego/magics.py
_DEAL_ENTRY_TOLERANCE_SEC = 600  # how close a decision-log "entered" event must
                                  # sit to a real fill's open time to call it a
                                  # match -- generous enough for network/MT5
                                  # execution latency, tight enough that two
                                  # entries on the same pair minutes apart on
                                  # different motifs don't get confused.


# ── I/O (not unit-testable without a live MT5 terminal + dashboard) ────────

def _fetch_json(url: str, timeout: int = 20):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def _kv_get(dashboard_url: str, key: str):
    d = _fetch_json(f'{dashboard_url.rstrip("/")}/api/kv/get?key={key}')
    return None if d.get('miss') else d.get('data')


def _connect_mt5(dashboard_url: str, mt5_path: str | None):
    try:
        import MetaTrader5 as mt5
    except ImportError:
        print('ERROR: MetaTrader5 package not installed -- this script needs '
              'the same environment motif_bot.py --live runs in.')
        sys.exit(1)

    creds = _kv_get(dashboard_url, 'motif_bot_credentials') or {}
    ok = mt5.initialize(path=mt5_path) if mt5_path else mt5.initialize()
    if not ok:
        print(f'ERROR: MT5 initialize() failed: {mt5.last_error()}')
        sys.exit(1)
    account = creds.get('mt5_account')
    if account:
        if not mt5.login(int(account), creds.get('mt5_password', ''),
                         creds.get('mt5_server', '')):
            print(f'ERROR: MT5 login() failed: {mt5.last_error()}')
            sys.exit(1)
    else:
        print('[warn] no mt5_account in motif_bot_credentials -- using whatever '
              'account the terminal is already logged into')
    return mt5


def fetch_live_trades(mt5, clock: ServerClock, date_from_utc: datetime, date_to_utc: datetime) -> list[dict]:
    """This bot's real closed+open positions in [date_from_utc, date_to_utc),
    grouped by position_id, with every timestamp corrected to real UTC via
    the measured broker-clock offset. Open positions (no OUT deal yet) are
    included with time_close/close_price/reason all None."""
    off = clock.offset_sec() or 0
    # Query on the BROKER's clock (MT5 compares its args against server-clock
    # epochs), then correct the deal timestamps it returns back to real UTC.
    deals = mt5.history_deals_get(date_from_utc + timedelta(seconds=off),
                                  date_to_utc + timedelta(seconds=off)) or []
    deals = [d for d in deals if d.magic == MAGIC]
    by_pos: dict = {}
    for d in deals:
        by_pos.setdefault(d.position_id, []).append(d)

    DEAL_ENTRY_IN = getattr(mt5, 'DEAL_ENTRY_IN', 0)
    DEAL_TYPE_BUY = getattr(mt5, 'DEAL_TYPE_BUY', 0)
    DEAL_REASON_SL, DEAL_REASON_TP = 4, 5

    out = []
    for position_id, group in by_pos.items():
        entries = [d for d in group if d.entry == DEAL_ENTRY_IN]
        exits = [d for d in group if d.entry != DEAL_ENTRY_IN]
        if not entries:
            continue  # position opened before the query window -- ambiguous, skip
        ind = entries[0]
        direction = 'BUY' if ind.type == DEAL_TYPE_BUY else 'SELL'
        row = {
            'position_id': position_id,
            'symbol': group[0].symbol,
            'direction': direction,
            'time_open': ind.time - off,          # -> real UTC epoch
            'open_price': ind.price,
            'profit': round(sum(d.profit for d in group), 2),
            'time_close': None, 'close_price': None, 'reason': None,
        }
        if exits:
            last_out = max(exits, key=lambda d: d.time)
            code = getattr(last_out, 'reason', None)
            row['time_close'] = last_out.time - off
            row['close_price'] = last_out.price
            row['reason'] = ('sl' if code == DEAL_REASON_SL else
                             'tp' if code == DEAL_REASON_TP else 'manual')
        out.append(row)
    out.sort(key=lambda t: t['time_open'])
    return out


def fetch_entered_events(dashboard_url: str) -> list[dict]:
    log = _kv_get(dashboard_url, 'motif_bot_decision_log') or {}
    return [e for e in (log.get('events') or []) if e.get('status') == 'entered']


def fetch_all_decisions(dashboard_url: str) -> list[dict]:
    log = _kv_get(dashboard_url, 'motif_bot_decision_log') or {}
    return list(log.get('events') or [])


def fetch_backtest_trades(dashboard_url: str) -> dict[str, dict]:
    """motif_key -> most-recently-logged trade record from motif_trades.json."""
    d = _fetch_json(f'{dashboard_url.rstrip("/")}/api/analogml/motif-trades')
    by_key: dict[str, dict] = {}
    for t in d.get('trades') or []:
        by_key[t['motif_key']] = t   # later entries overwrite -- log is append-only, last write is freshest
    return by_key


# ── Pure logic (unit-tested offline, see verify_motif_live_vs_backtest_test.py) ─

def _norm_pair(symbol: str) -> str:
    """Broker symbol (e.g. "EURUSD.a", "XAUUSDm") -> this project's canonical
    pair key ("eurusd", "gold"), via the SAME alias table `_mt5_sym`'s
    forward direction and every other bot's symbol handling already uses --
    not a hand-rolled suffix strip, which would silently mismatch gold
    (broker symbol XAUUSD vs the strategy's own key "gold") and any alias
    this repo hasn't seen a raw-suffix guess for."""
    return resolve_key(symbol) or (symbol or '').lower()


def match_trade_to_motif_key(live_trade: dict, entered_events: list[dict],
                             tolerance_sec: float = _DEAL_ENTRY_TOLERANCE_SEC) -> str | None:
    """The closest decision-log "entered" event on the same pair within
    `tolerance_sec` of the fill's real-UTC open time. Direction is NOT used
    to filter (a decision-log event doesn't carry BUY/SELL directly in every
    build) -- pair + time proximity alone is discriminating enough given the
    tolerance is a fraction of this strategy's own typical inter-trade
    spacing (bars are H1)."""
    pair = _norm_pair(live_trade['symbol'])
    best, best_dt = None, tolerance_sec + 1
    for e in entered_events:
        if _norm_pair(e.get('pair', '')) != pair:
            continue
        dt = abs((e.get('t') or 0) - live_trade['time_open'])
        if dt <= tolerance_sec and dt < best_dt:
            best, best_dt = e.get('motif_key'), dt
    return best


def compare_to_backtest(live_trade: dict, motif_key: str | None,
                        backtest_by_key: dict[str, dict]) -> dict:
    """One verdict dict: {motif_key, verdict, detail}. verdict is one of
    MATCH / DIVERGENCE / UNRESOLVED / UNMATCHED (see module docstring)."""
    if motif_key is None:
        return {'motif_key': None, 'verdict': 'UNMATCHED',
                'detail': 'no decision-log "entered" event found near this fill'}
    bt = backtest_by_key.get(motif_key)
    if bt is None:
        return {'motif_key': motif_key, 'verdict': 'DIVERGENCE',
                'detail': 'motif_key not found in motif_trades.json at all'}
    if bt.get('direction') != live_trade['direction']:
        return {'motif_key': motif_key, 'verdict': 'DIVERGENCE',
                'detail': f"direction mismatch: live={live_trade['direction']} backtest={bt.get('direction')}"}
    if bt.get('status') == 'open':
        if live_trade['reason'] is None:
            return {'motif_key': motif_key, 'verdict': 'MATCH',
                    'detail': 'both still open'}
        return {'motif_key': motif_key, 'verdict': 'UNRESOLVED',
                'detail': f"live already closed ({live_trade['reason']}), backtest hasn't raced this far yet"}
    live_outcome = live_trade['reason'] if live_trade['reason'] in ('tp', 'sl') else None
    if live_outcome is None:
        return {'motif_key': motif_key, 'verdict': 'DIVERGENCE',
                'detail': f"live closed manually (reason={live_trade['reason']!r}) — backtest has no 'manual' outcome to compare against"}
    if live_outcome != bt.get('status'):
        return {'motif_key': motif_key, 'verdict': 'DIVERGENCE',
                'detail': f"outcome mismatch: live={live_outcome} backtest={bt.get('status')} (backtest r={bt.get('r')})"}
    return {'motif_key': motif_key, 'verdict': 'MATCH',
            'detail': f"both {live_outcome} (backtest r={bt.get('r')}, live pnl={live_trade['profit']})"}


# ── main ─────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--url', required=True, help='dashboard base URL, e.g. https://macrofxmodel-production.up.railway.app')
    p.add_argument('--since', default=None, help='ISO date (UTC) to check from; default 14 days ago')
    p.add_argument('--mt5-path', default=None, help='path to terminal64.exe, only needed if MT5 can\'t be found automatically')
    args = p.parse_args()

    date_from = (datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc) if args.since
                else datetime.now(timezone.utc) - timedelta(days=14))
    date_to = datetime.now(timezone.utc) + timedelta(hours=1)

    print(f'Connecting to MT5...')
    mt5 = _connect_mt5(args.url, args.mt5_path)
    clock = ServerClock(mt5)
    clock.offset_sec(force=True)
    print(f'  broker clock offset: {clock.offset_sec()}s')

    print(f'Fetching live fills since {date_from.isoformat()}...')
    live_trades = fetch_live_trades(mt5, clock, date_from, date_to)
    print(f'  {len(live_trades)} position(s) (this bot\'s magic, {MAGIC})')

    print('Fetching motif_bot_decision_log...')
    entered = fetch_entered_events(args.url)
    all_decisions = fetch_all_decisions(args.url)
    print(f'  {len(entered)} "entered" event(s), {len(all_decisions)} decision event(s) total')

    print('Fetching motif_trades.json (the backtest, kept current)...')
    backtest_by_key = fetch_backtest_trades(args.url)
    print(f'  {len(backtest_by_key)} tracked motif(s)')

    print()
    print(f"{'Pair':<9}{'Dir':<6}{'Opened (UTC)':<21}{'Live outcome':<14}{'Verdict':<12}Detail")
    print('-' * 110)
    counts = {'MATCH': 0, 'DIVERGENCE': 0, 'UNRESOLVED': 0, 'UNMATCHED': 0}
    divergences = []
    for lt in live_trades:
        motif_key = match_trade_to_motif_key(lt, entered)
        v = compare_to_backtest(lt, motif_key, backtest_by_key)
        counts[v['verdict']] += 1
        if v['verdict'] == 'DIVERGENCE':
            divergences.append((lt, v))
        opened = datetime.fromtimestamp(lt['time_open'], tz=timezone.utc).strftime('%Y-%m-%d %H:%M')
        live_outcome = lt['reason'] or 'open'
        print(f"{lt['symbol']:<9}{lt['direction']:<6}{opened:<21}{live_outcome:<14}{v['verdict']:<12}{v['detail']}")

    print()
    print(f"Summary: {len(live_trades)} live trade(s) — "
          f"{counts['MATCH']} MATCH, {counts['DIVERGENCE']} DIVERGENCE, "
          f"{counts['UNRESOLVED']} UNRESOLVED, {counts['UNMATCHED']} UNMATCHED")
    if divergences:
        print()
        print('⚠ DIVERGENCES — investigate these first:')
        for lt, v in divergences:
            print(f"  {lt['symbol']} {lt['direction']} opened {datetime.fromtimestamp(lt['time_open'], tz=timezone.utc).isoformat()} "
                  f"(motif_key={v['motif_key']}): {v['detail']}")
    else:
        print()
        print('✓ No divergences — every live trade that could be matched to a motif_key '
              'agrees with the backtest on direction and outcome.')

    rejected = [e for e in all_decisions if e.get('status') in ('pair_blocked', 'would_block', 'rejected')]
    if rejected:
        print()
        print(f'(context: {len(rejected)} entries were seen but blocked/rejected over this window — '
              f'not compared here, this script only reconciles what the bot actually acted on)')


if __name__ == '__main__':
    main()
