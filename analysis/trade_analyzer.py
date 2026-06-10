#!/usr/bin/env python3
"""
Trade Intelligence Analyzer
Pulls MT5 closed-position history for all bots, enriches each trade with
engine context from the bot's log / journal, then produces per-bot signal
analysis and a combined CSV export.

Usage:
    python trade_analyzer.py [--days 90] [--output-dir output] [--bots RegimeV2 Gold]

Requirements (pip install):
    MetaTrader5   (Windows only, MT5 must be installed)

Note on sample size:
    Segments with n < MIN_SAMPLE are flagged !.  Treat those as directional
    hypotheses to validate in the backtester, not rules to ship.
"""

import os
import re
import csv
import json
import argparse
import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from pathlib import Path

# -- Config ---------------------------------------------------------------------

ROOT = Path(__file__).parent.parent

BOTS = {
    'MacroFX':  {'magic': 20260001, 'account': 10011001704},
    'RegimeV1': {'magic': 20260002, 'account': 10011001704},
    'RegimeV2': {'magic': 20260005, 'account': 10011001704},
    'Gold':     {'magic': 20260004, 'account': 10011043879},
}

LOG_FILES = {
    'RegimeV1': ROOT / 'bot'  / 'regime_bot.log',
    'RegimeV2': ROOT / 'logs' / 'regime_bot_v2.log',
    'MacroFX':  ROOT / 'bot'  / 'bot.log',
    'Gold':     ROOT / 'Gold' / 'logs' / 'gold_journal.jsonl',
}

MIN_SAMPLE = 20   # flag segments below this count

# -- Logging --------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format='%(levelname)s  %(message)s')
log = logging.getLogger(__name__)

# -- Helpers ---------------------------------------------------------------------

def _load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text(errors='ignore').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            # Strip inline comments (e.g. "value  # some note")
            v = v.split('#')[0].strip()
            env[k.strip()] = v
    return env


def _sym_norm(sym: str) -> str:
    """Strip / and _ so XAU/USD, XAUUSD, XAU_USD all match."""
    return sym.replace('/', '').replace('_', '').upper()


def _session(dt: datetime) -> str:
    h = dt.hour
    if   0  <= h <  7: return 'ASIA'
    elif 7  <= h < 12: return 'LONDON'
    elif 12 <= h < 17: return 'NY'
    elif 17 <= h < 21: return 'NY_CLOSE'
    else:               return 'ASIA_PRE'

# -- MT5 history pull ------------------------------------------------------------

def pull_all_mt5_history(from_date: datetime, to_date: datetime) -> list[dict]:
    """
    Connect to both MT5 accounts, pull closed deals, group into complete
    trades (entry + exit), tag each with the bot name via MAGIC number.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        log.error("MetaTrader5 not installed -- run: pip install MetaTrader5")
        return []

    magic_to_bot = {v['magic']: k for k, v in BOTS.items()}

    env_main = _load_env(ROOT / 'bot'  / '.env')
    env_gold = _load_env(ROOT / 'Gold' / '.env')

    account_configs = [
        (
            int(env_main.get('MT5_ACCOUNT', 10011001704)),
            env_main.get('MT5_PASSWORD', ''),
            env_main.get('MT5_SERVER',   'MetaQuotes-Demo'),
            env_main.get('MT5_PATH',     ''),
        ),
        (
            int(env_gold.get('MT5_ACCOUNT', 10011043879)),
            env_gold.get('MT5_PASSWORD', '').strip(),
            env_gold.get('MT5_SERVER',   'MetaQuotes-Demo'),
            env_gold.get('MT5_PATH',     '').strip(),
        ),
    ]

    all_records: list[dict] = []

    for account, password, server, mt5_path in account_configs:
        init_kwargs = {}
        if mt5_path:
            init_kwargs['path'] = mt5_path

        if not mt5.initialize(**init_kwargs):
            log.warning(f"MT5 init failed: {mt5.last_error()}")
            continue
        if not mt5.login(account, password=password, server=server):
            log.warning(f"MT5 login failed for account {account}: {mt5.last_error()}")
            mt5.shutdown()
            continue

        log.info(f"Pulling history: account {account}  {from_date.date()} -> {to_date.date()}")
        deals = mt5.history_deals_get(from_date, to_date) or []
        log.info(f"  Raw deals: {len(deals)}")

        # Group deals by position_id -> find entry deal + exit deal(s)
        by_pos: dict = defaultdict(lambda: {'in': None, 'outs': []})
        for d in deals:
            if d.magic not in magic_to_bot:
                continue
            pid = int(d.position_id)
            if d.entry == 0:          # entry deal
                by_pos[pid]['in'] = d
            elif d.entry in (1, 3):   # exit or partial exit
                by_pos[pid]['outs'].append(d)

        count = 0
        for pid, grp in by_pos.items():
            outs = grp['outs']
            if not outs:
                continue
            ind      = grp['in']
            last_out = max(outs, key=lambda d: d.time)
            magic    = ind.magic if ind else last_out.magic
            bot_name = magic_to_bot.get(magic, 'Unknown')

            if ind:
                direction  = 'BUY' if ind.type == 0 else 'SELL'
                open_price = round(float(ind.price), 5)
                time_open  = datetime.fromtimestamp(ind.time, tz=timezone.utc)
                ticket     = int(ind.order)
            else:
                direction  = 'BUY' if last_out.type == 1 else 'SELL'
                open_price = None
                time_open  = None
                ticket     = None

            pnl        = round(sum(d.profit     for d in outs), 2)
            swap       = round(sum(d.swap       for d in outs), 2)
            commission = round(sum(d.commission for d in outs), 2)
            net        = round(pnl + swap + commission, 2)
            time_close = datetime.fromtimestamp(last_out.time, tz=timezone.utc)

            if   net >  0.5: result = 'WIN'
            elif net < -0.5: result = 'LOSS'
            else:             result = 'BREAKEVEN'

            all_records.append({
                # Trade identity
                'position_id': pid,
                'bot':         bot_name,
                'magic':       magic,
                'account':     account,
                'ticket':      ticket,
                # Trade facts
                'symbol':      last_out.symbol,
                'direction':   direction,
                'lots':        round(sum(d.volume for d in outs), 2),
                'open_price':  open_price,
                'close_price': round(float(last_out.price), 5),
                'pnl':         pnl,
                'swap':        swap,
                'commission':  commission,
                'net':         net,
                'result':      result,
                'time_open':   time_open.isoformat() if time_open else None,
                'time_close':  time_close.isoformat(),
                # Context derived from timestamps
                'session':     _session(time_close),
                'day_of_week': time_close.strftime('%A'),
                'comment':     str(ind.comment if ind else last_out.comment or ''),
                # Engine fields -- filled by enrich_with_engine_context()
                'eng_regime':     None,
                'eng_conf':       None,
                'eng_score':      None,
                'eng_vol_z':      None,
                'eng_run_len':    None,
                'eng_decay':      None,
                'eng_bocpd':      None,
                'eng_consensus':  None,
                'eng_slope':      None,
                'eng_1h_regime':  None,
                'eng_exhaustion': None,
                'eng_exit_type':  None,
                'eng_sig':        None,
                'eng_grade':      None,
                'eng_stars':      None,
                'eng_rr':         None,
                'eng_dist_pips':  None,
                'eng_vu_signal':  None,
                'eng_vu_mf':      None,
                'eng_vu_vwap':    None,
                'eng_vu_conf':    None,
                'eng_htf_bias':   None,
                'eng_zone_score': None,
                'eng_composition': None,
                'eng_close_reason': None,
            })
            count += 1

        mt5.shutdown()
        log.info(f"  Parsed {count} positions for account {account}")

    log.info(f"Total positions across all bots: {len(all_records)}")
    return all_records

# -- Log parsers ------------------------------------------------------------------

def parse_regime_v1_log(log_path: Path) -> dict:
    """
    Regime V1 logs the MT5 ticket at entry -- use that for an exact join.
    Falls back to (norm_symbol, minute_ts) for any missed entries.

    Returns {'by_ticket': {ticket->ctx}, 'by_sym_ts': {(sym,ts)->ctx}}
    """
    by_ticket:  dict[int, dict]        = {}
    by_sym_ts:  dict[tuple, dict]      = {}

    if not log_path.exists():
        log.warning(f"Regime V1 log not found: {log_path}")
        return {'by_ticket': by_ticket, 'by_sym_ts': by_sym_ts}

    ts_re     = re.compile(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')
    regime_re = re.compile(
        r'\[(?P<sym>[A-Z0-9/_]+)\] regime=(?P<regime>\w+)'
        r'\s+conf=(?P<conf>[\d.]+)%'
        r'\s+vol_z=(?P<vz>[+\-\d.]+)'
        r'\s+rl=(?P<rl>\d+)'
        r'\s+decay=(?P<decay>[\d.]+)'
    )
    entry_re  = re.compile(
        r'\[(?P<sym>[A-Z0-9/_]+)\] ENTRY (?P<dir>LONG|SHORT)'
        r'\s+conf=(?P<conf>[\d.]+)%'
        r'\s+vol_z=(?P<vz>[+\-\d.]+)'
        r'\s+rl=(?P<rl>\d+)'
        r'\s+decay=(?P<decay>[\d.]+)'
        r'(?:.*?exit=(?P<exit>\w+))?'
    )
    ticket_re = re.compile(r'ticket=(\d+)')

    last_regimes: dict[str, dict] = {}
    pending:      dict[str, dict] = {}   # sym -> ctx awaiting ticket

    log.info(f"Parsing Regime V1 log: {log_path.name}  ({log_path.stat().st_size // 1_048_576} MB)")
    with open(log_path, errors='ignore') as f:
        for line in f:
            ts_m = ts_re.search(line)
            ts   = ts_m.group(1) if ts_m else None

            rm = regime_re.search(line)
            if rm:
                last_regimes[rm.group('sym')] = {
                    'eng_regime':  rm.group('regime'),
                    'eng_conf':    float(rm.group('conf')),
                    'eng_vol_z':   float(rm.group('vz')),
                    'eng_run_len': int(rm.group('rl')),
                    'eng_decay':   float(rm.group('decay')),
                }

            em = entry_re.search(line)
            if em:
                sym = em.group('sym')
                ctx = {
                    **last_regimes.get(sym, {}),
                    'eng_conf':     float(em.group('conf')),
                    'eng_vol_z':    float(em.group('vz')),
                    'eng_run_len':  int(em.group('rl')),
                    'eng_decay':    float(em.group('decay')),
                    'eng_exit_type': em.group('exit'),
                    '_sym': sym,
                    '_ts':  ts,
                }
                pending[sym] = ctx
                if ts:
                    by_sym_ts[(_sym_norm(sym), ts[:16])] = ctx

            if 'ticket=' in line:
                tm = ticket_re.search(line)
                if tm:
                    ticket = int(tm.group(1))
                    # Attach to most recent pending entry
                    if pending:
                        sym, ctx = next(iter(pending.items()))
                        by_ticket[ticket] = ctx
                        del pending[sym]

    log.info(f"  V1: {len(by_ticket)} ticket-matched, {len(by_sym_ts)} sym+ts fallbacks")
    return {'by_ticket': by_ticket, 'by_sym_ts': by_sym_ts}


def parse_regime_v2_log(log_path: Path) -> dict[tuple, dict]:
    """
    Regime V2 logs 10+ engine signals per entry.
    Key: (_sym_norm(symbol), 'YYYY-MM-DD HH:MM')
    """
    by_sym_ts: dict[tuple, dict] = {}

    if not log_path.exists():
        log.warning(f"Regime V2 log not found: {log_path}")
        return by_sym_ts

    ts_re    = re.compile(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')
    state_re = re.compile(
        r'\[RGV2\].*?\[(?P<sym>[A-Z0-9/_]+)\]'
        r'\s+reg=(?P<reg>\w+)\s+conf=(?P<conf>[\d.]+)%'
        r'\s+slope=(?P<slope>[+\-\d.]+)\s+vz=(?P<vz>[+\-\d.]+)'
        r'\s+rl=(?P<rl>\d+)\s+bocpd=(?P<bocpd>[\d.]+)%'
        r'\s+exh=(?P<exh>[\d.]+)\s+decay=(?P<decay>[\d.]+)'
        r'\s+score=(?P<score>[\d.]+)\s+1h=(?P<h1>\w+)'
    )
    entry_re = re.compile(
        r'\[RGV2\].*?\[(?P<sym>[A-Z0-9/_]+)\] ENTRY (?P<dir>SHORT|LONG)'
        r'\s+conf=(?P<conf>[\d.]+)%\s+score=(?P<score>[\d.]+)'
        r'\s+size_pct=(?P<size>[\d.]+)%\s+consensus=(?P<cons>\d+/\d+)'
        r'\s+bocpd=(?P<bocpd>[\d.]+)%\s+lots=(?P<lots>[\d.]+)'
    )

    last_states: dict[str, dict] = {}

    log.info(f"Parsing Regime V2 log: {log_path.name}  ({log_path.stat().st_size // 1_048_576} MB)")
    with open(log_path, errors='ignore') as f:
        for line in f:
            ts_m = ts_re.search(line)
            ts   = ts_m.group(1) if ts_m else None

            sm = state_re.search(line)
            if sm:
                last_states[sm.group('sym')] = {
                    'eng_regime':    sm.group('reg'),
                    'eng_conf':      float(sm.group('conf')),
                    'eng_slope':     float(sm.group('slope')),
                    'eng_vol_z':     float(sm.group('vz')),
                    'eng_run_len':   int(sm.group('rl')),
                    'eng_bocpd':     float(sm.group('bocpd')),
                    'eng_exhaustion': float(sm.group('exh')),
                    'eng_decay':     float(sm.group('decay')),
                    'eng_score':     float(sm.group('score')),
                    'eng_1h_regime': sm.group('h1'),
                }

            em = entry_re.search(line)
            if em and ts:
                sym = em.group('sym')
                ctx = {
                    **last_states.get(sym, {}),
                    'eng_conf':      float(em.group('conf')),
                    'eng_score':     float(em.group('score')),
                    'eng_bocpd':     float(em.group('bocpd')),
                    'eng_consensus': em.group('cons'),
                }
                by_sym_ts[(_sym_norm(sym), ts[:16])] = ctx

    log.info(f"  V2: {len(by_sym_ts)} sym+ts entries")
    return by_sym_ts


def parse_macrofx_log(log_path: Path) -> dict[tuple, dict]:
    """
    MacroFX logs star rating, grade, signal score, distance, R:R at entry.
    Key: (_sym_norm(symbol), 'YYYY-MM-DD HH:MM')
    """
    by_sym_ts: dict[tuple, dict] = {}

    if not log_path.exists():
        log.warning(f"MacroFX log not found: {log_path}")
        return by_sym_ts

    ts_re    = re.compile(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]')
    sig_re   = re.compile(
        r'\[(?P<sym>[A-Z/]+)\].*?(?P<stars>\d)[*]'
        r'.*?grade=(?P<grade>[A-F])'
        r'.*?sig=(?P<sig>[\d.]+)'
        r'.*?dist=(?P<dist>[\d.]+)pips'
        r'.*?R:R=(?P<rr>[\d.]+)'
    )

    log.info(f"Parsing MacroFX log: {log_path.name}  ({log_path.stat().st_size // 1_048_576} MB)")
    with open(log_path, errors='ignore') as f:
        for line in f:
            if '[*]' not in line:
                continue
            ts_m = ts_re.search(line)
            if not ts_m:
                continue
            ts = ts_m.group(1)
            m  = sig_re.search(line)
            if m:
                sym = m.group('sym')
                by_sym_ts[(_sym_norm(sym), ts[:16])] = {
                    'eng_stars':     int(m.group('stars')),
                    'eng_grade':     m.group('grade'),
                    'eng_sig':       float(m.group('sig')),
                    'eng_dist_pips': float(m.group('dist')),
                    'eng_rr':        float(m.group('rr')),
                }

    log.info(f"  MacroFX: {len(by_sym_ts)} sym+ts entries")
    return by_sym_ts


def parse_gold_journal(log_path: Path) -> dict[str, dict]:
    """
    Gold's JSONL journal already has full entry + close context per zone_id.
    Returns {zone_id: {'entry': {...}, 'close': {...}}}
    Also builds a timestamp index for matching to MT5 trades.
    """
    by_zone: dict[str, dict] = {}

    if not log_path.exists():
        log.warning(f"Gold journal not found: {log_path}")
        return by_zone

    fib_re = re.compile(r'\.\d{3} @ ')   # fib level text like ".886 @ 4471.2"

    log.info(f"Parsing Gold journal: {log_path.name}  ({log_path.stat().st_size // 1_048_576} MB)")
    with open(log_path, errors='ignore') as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue

            rtype = rec.get('type')
            zid   = rec.get('zone_id')
            if not zid:
                continue

            if zid not in by_zone:
                by_zone[zid] = {}

            if rtype == 'ENTRY_SIGNAL':
                vu   = rec.get('vumanchu', {})
                raw  = rec.get('composition', [])
                # Deduplicate -- repeated fib lines inflate score
                seen  = set()
                unique = []
                for item in raw:
                    key = item if not fib_re.search(item) else fib_re.sub('@ ', item)
                    if key not in seen:
                        seen.add(key)
                        unique.append(item)

                by_zone[zid]['entry'] = {
                    'eng_zone_score':  rec.get('score'),          # raw (may be inflated)
                    'eng_score':       len(unique),               # deduplicated count
                    'eng_htf_bias':    rec.get('direction'),
                    'eng_vu_signal':   vu.get('wt_signal'),
                    'eng_vu_mf':       vu.get('mf_signal'),
                    'eng_vu_vwap':     vu.get('vwap_signal'),
                    'eng_vu_conf':     vu.get('confidence'),
                    'eng_composition': '|'.join(unique[:10]),
                    '_ts_min':         rec.get('timestamp', '')[:16].replace('T', ' '),
                    '_open_price':     rec.get('entry_price'),
                    '_mode':           rec.get('mode'),
                }

            elif rtype == 'TRADE_CLOSED':
                by_zone[zid]['close'] = {
                    'eng_close_reason': rec.get('reason'),
                    'pnl_pips':         rec.get('pnl_pips'),
                    'result':           rec.get('result'),
                }

    log.info(f"  Gold: {len(by_zone)} zones parsed")
    return by_zone

# -- Engine context enrichment ----------------------------------------------------

ENGINE_FIELDS = [
    'eng_regime','eng_conf','eng_score','eng_vol_z','eng_run_len','eng_decay',
    'eng_bocpd','eng_consensus','eng_slope','eng_1h_regime','eng_exhaustion',
    'eng_exit_type','eng_sig','eng_grade','eng_stars','eng_rr','eng_dist_pips',
    'eng_vu_signal','eng_vu_mf','eng_vu_vwap','eng_vu_conf','eng_htf_bias',
    'eng_zone_score','eng_composition','eng_close_reason',
]

def _apply_ctx(rec: dict, ctx: dict) -> None:
    for field in ENGINE_FIELDS:
        if field in ctx and ctx[field] is not None:
            rec[field] = ctx[field]


def parse_dashboard_csv(csv_path: Path) -> list[dict]:
    """
    Read dashboard-format paper trade CSV and return records in same dict
    format as pull_all_mt5_history() so they flow through the same enrichment
    and analysis pipeline.

    Expected columns: Date,Pair,Bot,Dir,Lots,Entry,Close,PnL,Swap,Net,
                      Opened,Closed,Duration
    Timestamps are 'YYYY-MM-DD HH:MM UTC'.
    """
    records = []
    if not csv_path.exists():
        log.warning(f"Dashboard CSV not found: {csv_path}")
        return records

    null_engine = {f: None for f in ENGINE_FIELDS}

    # Dashboard shows UTC+2 (CEST) labelled as "UTC"; bot logs use machine local
    # time which is 2 hours behind.  Shift timestamps to match log time so the
    # sym+ts join in enrich_with_engine_context() finds the right ENTRY lines.
    LOG_OFFSET = timedelta(hours=2)

    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            try:
                opened_s   = row['Opened'].replace(' UTC', '').strip()
                closed_s   = row['Closed'].replace(' UTC', '').strip()
                time_open  = (datetime.strptime(opened_s, '%Y-%m-%d %H:%M')
                              .replace(tzinfo=timezone.utc) - LOG_OFFSET)
                time_close = (datetime.strptime(closed_s, '%Y-%m-%d %H:%M')
                              .replace(tzinfo=timezone.utc) - LOG_OFFSET)

                net = float(row['Net'].replace('+', ''))
                if   net >  0.5: result = 'WIN'
                elif net < -0.5: result = 'LOSS'
                else:             result = 'BREAKEVEN'

                records.append({
                    'position_id': f'paper_{i}',
                    'bot':         'RegimeV2',
                    'magic':       20260005,
                    'account':     10011001704,
                    'ticket':      None,
                    'symbol':      _sym_norm(row['Pair']),
                    'direction':   row['Dir'].upper(),
                    'lots':        float(row['Lots']),
                    'open_price':  float(row['Entry']),
                    'close_price': float(row['Close']),
                    'pnl':         float(row['PnL'].replace('+', '')),
                    'swap':        float(row['Swap'].replace('+', '')),
                    'commission':  0.0,
                    'net':         net,
                    'result':      result,
                    'time_open':   time_open.isoformat(),
                    'time_close':  time_close.isoformat(),
                    'session':     _session(time_close),
                    'day_of_week': time_close.strftime('%A'),
                    'comment':     'PAPER',
                    **null_engine,
                })
            except (KeyError, ValueError) as e:
                log.warning(f"CSV row {i + 2}: skipped -- {e}")

    log.info(f"Dashboard CSV: {len(records)} V2 paper trades from {csv_path.name}")
    return records


def enrich_with_engine_context(records:    list[dict],
                                v1_ctx:    dict,
                                v2_ctx:    dict,
                                macro_ctx: dict,
                                gold_jrnl: dict) -> list[dict]:
    v1_by_ticket  = v1_ctx.get('by_ticket', {})
    v1_by_sym_ts  = v1_ctx.get('by_sym_ts', {})

    # Build a ts->zone lookup for Gold (match MT5 trade open time to journal entry)
    gold_by_ts: dict[str, dict] = {}
    for zid, zone in gold_jrnl.items():
        entry = zone.get('entry', {})
        ts    = entry.get('_ts_min', '')
        if ts:
            gold_by_ts[ts] = {**entry, **zone.get('close', {}), '_zone_id': zid}

    matched = 0
    for rec in records:
        bot    = rec['bot']
        sym    = _sym_norm(rec['symbol'])
        ts_min = rec['time_open'][:16].replace('T', ' ') if rec['time_open'] else ''
        ticket = rec.get('ticket')

        ctx = None

        if bot == 'RegimeV1':
            if ticket and ticket in v1_by_ticket:
                ctx = v1_by_ticket[ticket]
            else:
                ctx = v1_by_sym_ts.get((sym, ts_min))

        elif bot == 'RegimeV2':
            ctx = v2_ctx.get((sym, ts_min))
            # Widen search +/-2 minutes for clock-skew between log timestamp and MT5 deal time
            if not ctx and rec['time_open']:
                base = datetime.fromisoformat(rec['time_open'])
                for delta in (1, -1, 2, -2):
                    alt_ts = (base + timedelta(minutes=delta)).strftime('%Y-%m-%d %H:%M')
                    ctx = v2_ctx.get((sym, alt_ts))
                    if ctx:
                        break

        elif bot == 'MacroFX':
            ctx = macro_ctx.get((sym, ts_min))

        elif bot == 'Gold':
            ctx = gold_by_ts.get(ts_min)
            if not ctx and rec['time_open']:
                base = datetime.fromisoformat(rec['time_open'])
                for delta in (1, -1, 2, -2):
                    alt_ts = (base + timedelta(minutes=delta)).strftime('%Y-%m-%d %H:%M')
                    ctx = gold_by_ts.get(alt_ts)
                    if ctx:
                        break

        if ctx:
            _apply_ctx(rec, ctx)
            matched += 1

    log.info(f"Engine context matched: {matched}/{len(records)} trades")
    return records

# -- Analysis helpers -------------------------------------------------------------

def _win_rate(trades: list[dict]) -> tuple[float, int]:
    decisive = [t for t in trades if t['result'] in ('WIN', 'LOSS')]
    wins     = sum(1 for t in decisive if t['result'] == 'WIN')
    return (wins / len(decisive) * 100 if decisive else 0.0), len(decisive)


def _expectancy(trades: list[dict]) -> float:
    nets = [t['net'] for t in trades]
    return round(sum(nets) / len(nets), 2) if nets else 0.0


def _bucket_rows(trades: list[dict], field: str, buckets: list) -> list[dict]:
    vals = [(t[field], t) for t in trades if t.get(field) is not None]
    rows = []
    for lo, hi in zip(buckets, buckets[1:]):
        group = [t for v, t in vals if lo <= v < hi]
        wr, n = _win_rate(group)
        rows.append({
            'label':      f'{lo}-{hi}',
            'n':          n,
            'win_rate':   wr,
            'expectancy': _expectancy(group),
            'low_n':      n < MIN_SAMPLE,
        })
    return rows


def _threshold_scan(trades: list[dict], field: str, thresholds: list,
                    direction: str = 'ge') -> list[dict]:
    """
    Cumulative threshold scan -- answers "what if I only take trades where field >= X?"
    direction='ge' : field >= threshold  (for conf, score, bocpd, rl -- higher is stricter)
    direction='le' : field <= threshold  (for decay, exhaustion -- lower is stricter)
    """
    vals = [(t[field], t) for t in trades if t.get(field) is not None]
    rows = []
    for thresh in thresholds:
        if direction == 'ge':
            group = [t for v, t in vals if v >= thresh]
        else:
            group = [t for v, t in vals if v <= thresh]
        wr, n = _win_rate(group)
        rows.append({
            'threshold': thresh,
            'direction': direction,
            'n':         n,
            'win_rate':  wr,
            'expectancy': _expectancy(group),
            'low_n':     n < MIN_SAMPLE,
        })
    return rows


def _suggest(rows: list[dict], min_n: int = 15) -> dict | None:
    """Return threshold row with best win rate where n >= min_n."""
    candidates = [r for r in rows if r['n'] >= min_n]
    return max(candidates, key=lambda r: r['win_rate']) if candidates else None


def _fmt_threshold(rows: list[dict], label: str, symbol: str = '>=',
                   optuna_val: float | None = None) -> list[str]:
    """Format a threshold scan block with suggestion line."""
    out = [f'    {label}:']
    best = _suggest(rows)
    for r in rows:
        direction_sym = symbol
        marker = ''
        if optuna_val is not None and r['threshold'] == optuna_val:
            marker = '  <- Optuna optimal'
        if best and r['threshold'] == best['threshold'] and not r['low_n']:
            marker += '  [*] suggested'
        flag = '  ! low-n' if r['low_n'] else ''
        out.append(
            f"      {direction_sym}{str(r['threshold']):<8}"
            f"  n={r['n']:4d}"
            f"  WR={r['win_rate']:5.1f}%"
            f"  exp=${r['expectancy']:+7.2f}"
            f"{flag}{marker}"
        )
    if best:
        sym_str = '<=' if rows[0]['direction'] == 'le' else '>='
        out.append(
            f"    [*]  Suggested: {label.split('(')[0].strip()} {sym_str} {best['threshold']}"
            f"   ->  WR={best['win_rate']:.1f}%  n={best['n']}"
        )
    return out


def _cat_rows(trades: list[dict], field: str) -> list[dict]:
    groups: dict[str, list] = defaultdict(list)
    for t in trades:
        v = t.get(field)
        if v is not None:
            groups[str(v)].append(t)
    rows = []
    for val, group in groups.items():
        wr, n = _win_rate(group)
        rows.append({
            'label':      val,
            'n':          n,
            'win_rate':   wr,
            'expectancy': _expectancy(group),
            'low_n':      n < MIN_SAMPLE,
        })
    return sorted(rows, key=lambda r: -r['win_rate'])


def _fmt_rows(rows: list[dict], label_w: int = 20) -> list[str]:
    out = []
    for r in rows:
        flag = '  ! low-n' if r['low_n'] else ''
        out.append(
            f"      {r['label']:<{label_w}}  n={r['n']:4d}"
            f"  WR={r['win_rate']:5.1f}%  exp=${r['expectancy']:+7.2f}{flag}"
        )
    return out

# -- Per-bot report ---------------------------------------------------------------

def analyze_bot(bot_name: str, trades: list[dict]) -> str:
    out = []
    bar = '=' * 62
    out.append(f'\n{bar}')
    out.append(f'  {bot_name.upper()}  --  {len(trades)} total trades')
    out.append(bar)

    wr, n     = _win_rate(trades)
    exp       = _expectancy(trades)
    total_net = round(sum(t['net'] for t in trades), 2)
    out.append(f'  Overall win rate : {wr:.1f}%  (n={n} decisive)')
    out.append(f'  Expectancy/trade : ${exp:+.2f}')
    out.append(f'  Total net P&L    : ${total_net:+,.2f}')

    # -- By pair ------------------------------------------------------------
    out.append('\n  BY PAIR:')
    pairs: dict[str, list] = defaultdict(list)
    for t in trades:
        pairs[t['symbol']].append(t)
    for sym, grp in sorted(pairs.items()):
        pwr, pn = _win_rate(grp)
        pnet    = round(sum(t['net'] for t in grp), 2)
        flag    = '  !' if pn < MIN_SAMPLE else ''
        out.append(f'    {sym:<12}  n={pn:4d}  WR={pwr:5.1f}%  net=${pnet:+9.2f}{flag}')

    # -- By direction -------------------------------------------------------
    out.append('\n  BY DIRECTION:')
    for d in ('BUY', 'SELL'):
        grp = [t for t in trades if t['direction'] == d]
        dwr, dn = _win_rate(grp)
        flag    = '  !' if dn < MIN_SAMPLE else ''
        out.append(f'    {d:<6}  n={dn:4d}  WR={dwr:5.1f}%  exp=${_expectancy(grp):+7.2f}{flag}')

    # -- By session ---------------------------------------------------------
    out.append('\n  BY SESSION (close time UTC):')
    for sess in ('ASIA', 'LONDON', 'NY', 'NY_CLOSE', 'ASIA_PRE'):
        grp = [t for t in trades if t['session'] == sess]
        if not grp:
            continue
        swr, sn = _win_rate(grp)
        flag    = '  !' if sn < MIN_SAMPLE else ''
        out.append(f'    {sess:<10}  n={sn:4d}  WR={swr:5.1f}%  exp=${_expectancy(grp):+7.2f}{flag}')

    # -- By day -------------------------------------------------------------
    out.append('\n  BY DAY:')
    for day in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'):
        grp = [t for t in trades if t['day_of_week'] == day]
        if not grp:
            continue
        dwr, dn = _win_rate(grp)
        dnet    = round(sum(t['net'] for t in grp), 2)
        flag    = '  !' if dn < MIN_SAMPLE else ''
        out.append(f'    {day:<12}  n={dn:4d}  WR={dwr:5.1f}%  net=${dnet:+9.2f}{flag}')

    # -- Engine analysis ----------------------------------------------------
    enriched = [t for t in trades if any(t.get(f) is not None for f in ENGINE_FIELDS)]
    out.append(f'\n  ENGINE SIGNAL ANALYSIS  ({len(enriched)} / {len(trades)} trades have context)')

    if not enriched:
        out.append('    No log context matched -- logs may not cover this date range.')
        return '\n'.join(out)

    # -- Regime V1 engine analysis --------------------------------------------
    if bot_name == 'RegimeV1':
        out.append('\n  -- Entry quality signals --')

        # Regime type
        rows = _cat_rows(enriched, 'eng_regime')
        if rows:
            out.append('\n    Regime at entry (sorted by WR):')
            out.extend(_fmt_rows(sorted(rows, key=lambda r: -r['win_rate'])))

        # Confidence -- threshold scan (higher = stricter filter)
        rows = _threshold_scan(enriched, 'eng_conf',
                               [50, 60, 70, 80, 85, 90, 95, 99])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Confidence %'))

        # Vol Z-score -- bucket (signed; we want to know which vol environment wins)
        rows = _bucket_rows(enriched, 'eng_vol_z',
                            [-99, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 99])
        if rows:
            out.append('\n    Vol Z-score at entry  (negative=quiet, positive=elevated):')
            for r in sorted(rows, key=lambda r: -r['win_rate']):
                flag = '  ! low-n' if r['low_n'] else ''
                out.append(
                    f"      vz {r['label']:<14}"
                    f"  n={r['n']:4d}  WR={r['win_rate']:5.1f}%"
                    f"  exp=${r['expectancy']:+7.2f}{flag}"
                )
            # Derive best vol-z range
            best_vz = _suggest([{**r, 'threshold': r['label']} for r in rows], min_n=10)
            if best_vz:
                out.append(f"    [*]  Best vol-z range: {best_vz['threshold']}  ->  WR={best_vz['win_rate']:.1f}%")

        # Run length -- threshold scan (more bars in regime = more established)
        rows = _threshold_scan(enriched, 'eng_run_len', [2, 5, 8, 12, 20, 30])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Run length RL (bars in regime, more = more established)'))

        # Decay -- threshold scan LE (lower decay = cleaner regime)
        rows = _threshold_scan(enriched, 'eng_decay',
                               [0.0, 0.02, 0.05, 0.1, 0.2, 0.4], direction='le')
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Decay (lower = cleaner regime)', symbol='<='))

        out.append('\n  -- Exit quality signals --')

        # Exit type -- what exit condition leads to best outcomes?
        rows = _cat_rows(enriched, 'eng_exit_type')
        if rows:
            out.append('\n    Exit type (what condition closed the trade):')
            out.extend(_fmt_rows(sorted(rows, key=lambda r: -r['win_rate'])))

        # RL at entry vs exit outcome (do longer-running regimes exit better?)
        out.append('\n    Run length vs outcome  (same signal, framed as "trade held longer in regime"):')
        out.append('    (Cross-ref with RL scan above -- RL at entry predicts both entry and exit quality)')

    # -- Regime V2 engine analysis ---------------------------------------------
    elif bot_name == 'RegimeV2':
        out.append('\n  -- Entry quality signals --')
        out.append('  Format: trades where signal >= X -- shows what threshold maximises win rate.')

        # 5m regime type
        rows = _cat_rows(enriched, 'eng_regime')
        if rows:
            out.append('\n    5m Regime at entry (sorted by WR):')
            out.extend(_fmt_rows(sorted(rows, key=lambda r: -r['win_rate'])))

        # 1H alignment
        rows = _cat_rows(enriched, 'eng_1h_regime')
        if rows:
            out.append('\n    1H regime (HTF alignment, sorted by WR):')
            out.extend(_fmt_rows(sorted(rows, key=lambda r: -r['win_rate'])))

        # Consensus
        rows = _cat_rows(enriched, 'eng_consensus')
        if rows:
            out.append('\n    Consensus:')
            out.extend(_fmt_rows(sorted(rows, key=lambda r: -r['win_rate'])))

        # Score -- threshold scan (Optuna found >=74 optimal for EURUSD)
        rows = _threshold_scan(enriched, 'eng_score',
                               [50, 55, 60, 65, 70, 74, 80, 85, 90])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Score', optuna_val=74))

        # Confidence -- threshold scan
        rows = _threshold_scan(enriched, 'eng_conf',
                               [50, 60, 70, 80, 85, 90, 95, 99])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Confidence %'))

        # BOCPD -- threshold scan (change-point certainty; higher = more committed to new regime)
        rows = _threshold_scan(enriched, 'eng_bocpd',
                               [20, 30, 40, 50, 60, 70, 80, 90])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'BOCPD % (change-point certainty)'))

        # Slope -- signed bucket (momentum direction)
        rows = _bucket_rows(enriched, 'eng_slope',
                            [-99, -10, -5, -2, -1, 0, 1, 2, 5, 10, 99])
        if rows:
            out.append('\n    Slope (momentum direction, sorted by WR):')
            for r in sorted(rows, key=lambda r: -r['win_rate']):
                flag = '  ! low-n' if r['low_n'] else ''
                out.append(
                    f"      slope {r['label']:<14}"
                    f"  n={r['n']:4d}  WR={r['win_rate']:5.1f}%"
                    f"  exp=${r['expectancy']:+7.2f}{flag}"
                )

        # Vol Z-score -- signed bucket
        rows = _bucket_rows(enriched, 'eng_vol_z',
                            [-99, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 99])
        if rows:
            out.append('\n    Vol Z-score at entry  (negative=quiet, positive=elevated, sorted by WR):')
            for r in sorted(rows, key=lambda r: -r['win_rate']):
                flag = '  ! low-n' if r['low_n'] else ''
                out.append(
                    f"      vz {r['label']:<14}"
                    f"  n={r['n']:4d}  WR={r['win_rate']:5.1f}%"
                    f"  exp=${r['expectancy']:+7.2f}{flag}"
                )

        # Exhaustion -- threshold scan LE (lower = less exhausted = fresher move)
        rows = _threshold_scan(enriched, 'eng_exhaustion',
                               [0.0, 0.02, 0.05, 0.1, 0.2, 0.4], direction='le')
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Exhaustion (lower = regime not yet overextended)', symbol='<='))

        # Decay -- threshold scan LE
        rows = _threshold_scan(enriched, 'eng_decay',
                               [0.0, 0.02, 0.05, 0.1, 0.2, 0.4], direction='le')
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Decay (lower = cleaner, more sustained regime)', symbol='<='))

        # Run length
        rows = _threshold_scan(enriched, 'eng_run_len', [2, 5, 8, 12, 20, 30])
        if rows:
            out.append('')
            out.extend(_fmt_threshold(rows, 'Run length RL (bars regime has been active)'))

        # -- Combined filter analysis --------------------------------------
        out.append('\n  -- Combined filter analysis --')
        out.append('  Shows what happens when multiple signals are satisfied together.')

        def _combined(label: str, fn) -> None:
            grp = [t for t in enriched if fn(t)]
            wr, n = _win_rate(grp)
            flag  = '  ! low-n' if n < MIN_SAMPLE else ''
            out.append(
                f"    {label:<55}"
                f"  n={n:4d}  WR={wr:5.1f}%  exp=${_expectancy(grp):+7.2f}{flag}"
            )

        out.append('')
        _combined('All enriched trades (baseline)',
                  lambda t: True)
        _combined('Score >= 74  (Optuna floor)',
                  lambda t: (t.get('eng_score') or 0) >= 74)
        _combined('Conf >= 85%',
                  lambda t: (t.get('eng_conf') or 0) >= 85)
        _combined('BOCPD >= 70%',
                  lambda t: (t.get('eng_bocpd') or 0) >= 70)
        _combined('Decay <= 0.05',
                  lambda t: (t.get('eng_decay') or 1) <= 0.05)
        _combined('5m regime == 1h regime  (HTF aligned)',
                  lambda t: t.get('eng_regime') == t.get('eng_1h_regime'))
        _combined('Score >= 74  AND  Conf >= 85%',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and (t.get('eng_conf') or 0) >= 85)
        _combined('Score >= 74  AND  BOCPD >= 70%',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and (t.get('eng_bocpd') or 0) >= 70)
        _combined('Score >= 74  AND  HTF aligned',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and t.get('eng_regime') == t.get('eng_1h_regime'))
        _combined('Score >= 74  AND  Conf >= 85%  AND  HTF aligned',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and (t.get('eng_conf') or 0) >= 85
                            and t.get('eng_regime') == t.get('eng_1h_regime'))
        _combined('Score >= 74  AND  BOCPD >= 70%  AND  Decay <= 0.05',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and (t.get('eng_bocpd') or 0) >= 70
                            and (t.get('eng_decay') or 1) <= 0.05)
        _combined('ALL: Score>=74, Conf>=85%, BOCPD>=70%, HTF aligned, Decay<=0.05',
                  lambda t: (t.get('eng_score') or 0) >= 74
                            and (t.get('eng_conf') or 0) >= 85
                            and (t.get('eng_bocpd') or 0) >= 70
                            and t.get('eng_regime') == t.get('eng_1h_regime')
                            and (t.get('eng_decay') or 1) <= 0.05)

    # --- MacroFX signals ---
    elif bot_name == 'MacroFX':
        rows = _cat_rows(enriched, 'eng_stars')
        if rows:
            out.append('\n    Signal stars:')
            for r in rows:
                flag  = '  ! low-n' if r['low_n'] else ''
                stars = '[*]' * int(r['label'])
                out.append(
                    f"      {stars:<8}  n={r['n']:4d}"
                    f"  WR={r['win_rate']:5.1f}%  exp=${r['expectancy']:+7.2f}{flag}"
                )

        rows = _cat_rows(enriched, 'eng_grade')
        if rows:
            out.append('\n    Grade:')
            out.extend(_fmt_rows(rows))

        rows = _bucket_rows(enriched, 'eng_sig', [0, 40, 50, 55, 60, 65, 70, 100])
        if rows:
            out.append('\n    Signal score:')
            out.extend(_fmt_rows(rows))

        rows = _bucket_rows(enriched, 'eng_rr', [0, 0.5, 1.0, 1.5, 2.0, 3.0, 99])
        if rows:
            out.append('\n    R:R at entry:')
            out.extend(_fmt_rows(rows))

        rows = _bucket_rows(enriched, 'eng_dist_pips', [0, 0.5, 1, 2, 3, 5, 99])
        if rows:
            out.append('\n    Distance from level (pips):')
            out.extend(_fmt_rows(rows))

    # --- Gold signals ---
    elif bot_name == 'Gold':
        rows = _bucket_rows(enriched, 'eng_zone_score', [0, 3, 5, 8, 12, 20, 9999])
        if rows:
            out.append('\n    Zone score (raw -- duplicates inflate this):')
            out.extend(_fmt_rows(rows))

        rows = _bucket_rows(enriched, 'eng_score', [0, 3, 5, 7, 10, 15, 9999])
        if rows:
            out.append('\n    Zone score (deduplicated composition count):')
            out.extend(_fmt_rows(rows))

        rows = _cat_rows(enriched, 'eng_vu_signal')
        if rows:
            out.append('\n    VuManChu WT signal:')
            out.extend(_fmt_rows(rows, label_w=28))

        rows = _cat_rows(enriched, 'eng_vu_mf')
        if rows:
            out.append('\n    VuManChu MF signal:')
            out.extend(_fmt_rows(rows, label_w=28))

        rows = _cat_rows(enriched, 'eng_vu_vwap')
        if rows:
            out.append('\n    VWAP signal:')
            out.extend(_fmt_rows(rows, label_w=28))

        rows = _cat_rows(enriched, 'eng_vu_conf')
        if rows:
            out.append('\n    VuManChu confidence:')
            out.extend(_fmt_rows(rows))

        rows = _cat_rows(enriched, 'eng_close_reason')
        if rows:
            out.append('\n    Close reason:')
            out.extend(_fmt_rows(rows))

        rows = _cat_rows(enriched, 'eng_htf_bias')
        if rows:
            out.append('\n    HTF bias at entry:')
            out.extend(_fmt_rows(rows))

    out.append('')
    return '\n'.join(out)

# -- Cross-bot summary ------------------------------------------------------------

def cross_bot_summary(records: list[dict]) -> str:
    out  = []
    bar  = '=' * 62
    out.append(f'\n{bar}')
    out.append('  CROSS-BOT SUMMARY')
    out.append(bar)

    bots = sorted(set(r['bot'] for r in records))

    out.append('\n  Per-bot overview:')
    for bot in bots:
        grp = [r for r in records if r['bot'] == bot]
        wr, n = _win_rate(grp)
        net   = round(sum(t['net'] for t in grp), 2)
        out.append(
            f'    {bot:<12}  trades={len(grp):4d}'
            f'  WR={wr:5.1f}% (n={n})'
            f'  exp=${_expectancy(grp):+7.2f}'
            f'  total=${net:+10.2f}'
        )

    # Pairs traded by multiple bots -- risk concentration
    out.append('\n  Pairs traded by multiple bots (risk concentration):')
    pair_bots: dict[str, set] = defaultdict(set)
    for r in records:
        pair_bots[r['symbol']].add(r['bot'])
    overlap = [(sym, bts) for sym, bts in pair_bots.items() if len(bts) > 1]
    if overlap:
        for sym, bts in sorted(overlap):
            out.append(f'    {sym:<12}  -> {", ".join(sorted(bts))}')
    else:
        out.append('    None detected in this date range')

    # Max consecutive losses per bot (drawdown run)
    out.append('\n  Max consecutive losses per bot:')
    for bot in bots:
        grp     = sorted([r for r in records if r['bot'] == bot], key=lambda t: t['time_close'])
        max_run = cur = 0
        for t in grp:
            if t['result'] == 'LOSS':
                cur += 1
                max_run = max(max_run, cur)
            else:
                cur = 0
        out.append(f'    {bot:<12}  {max_run} consecutive')

    out.append('')
    return '\n'.join(out)

# -- CSV export -------------------------------------------------------------------

def export_csv(records: list[dict], out_path: Path) -> None:
    if not records:
        return
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    log.info(f"CSV saved -> {out_path}")

# -- Entry point ------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='Trade Intelligence Analyzer')
    parser.add_argument('--days',       type=int, default=90,
                        help='Days of MT5 history to pull (default: 90)')
    parser.add_argument('--output-dir', default='output',
                        help='Output directory (default: analysis/output)')
    parser.add_argument('--bots',       nargs='+',
                        choices=['MacroFX', 'RegimeV1', 'RegimeV2', 'Gold'],
                        help='Limit report to specific bots')
    args = parser.parse_args()

    out_dir   = Path(__file__).parent / args.output_dir
    to_date   = datetime.now(tz=timezone.utc)
    from_date = to_date - timedelta(days=args.days)

    log.info(f"Date range: {from_date.date()} -> {to_date.date()}")

    # 1. MT5 history
    records = pull_all_mt5_history(from_date, to_date)

    # Load V2 paper trades from dashboard CSV (paper mode trades don't reach MT5)
    v2_csv = Path(__file__).parent / 'input' / 'v2_paper_trades.csv'
    if v2_csv.exists():
        paper = parse_dashboard_csv(v2_csv)
        records.extend(paper)
        log.info(f"Added {len(paper)} V2 paper trades from CSV (total records: {len(records)})")

    if not records:
        log.error("No records -- check MT5 connection and credentials.")
        return

    # 2. Parse engine context from logs
    v1_ctx    = parse_regime_v1_log(LOG_FILES['RegimeV1'])
    v2_ctx    = parse_regime_v2_log(LOG_FILES['RegimeV2'])
    macro_ctx = parse_macrofx_log(LOG_FILES['MacroFX'])
    gold_jrnl = parse_gold_journal(LOG_FILES['Gold'])

    # 3. Enrich
    records = enrich_with_engine_context(records, v1_ctx, v2_ctx, macro_ctx, gold_jrnl)

    # 4. Filter bots if requested
    if args.bots:
        records = [r for r in records if r['bot'] in args.bots]

    # 5. Export CSV (full enriched table)
    export_csv(records, out_dir / 'trades_combined.csv')

    # 6. Build report
    header = [
        '',
        'TRADE INTELLIGENCE REPORT',
        f'Period  : {from_date.date()} -> {to_date.date()}  ({args.days} days)',
        f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}',
        f'Positions: {len(records)}',
        f'',
        f'!  Segments flagged with ! have n < {MIN_SAMPLE} -- directional signal only.',
        f'   Validate in backtester before adjusting live config.',
    ]

    parts = ['\n'.join(header)]
    parts.append(cross_bot_summary(records))
    for bot_name in sorted(set(r['bot'] for r in records)):
        if args.bots and bot_name not in args.bots:
            continue
        parts.append(analyze_bot(bot_name, [r for r in records if r['bot'] == bot_name]))

    report = '\n'.join(parts)
    print(report)

    report_path = out_dir / 'report.txt'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding='utf-8')
    log.info(f"Report saved -> {report_path}")


if __name__ == '__main__':
    main()
