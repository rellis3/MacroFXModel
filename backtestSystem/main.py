"""
backtestSystem/main.py — MT5 trading loop.
Completely separate from the main bot; no KV / Railway dependency.
Reads configs/active.json, connects to MT5, polls every pollInterval seconds (default 60).
"""

import logging
import os
import sys
import time
import urllib.request
import json
from datetime import datetime, timedelta

from dotenv import load_dotenv

from config    import load_config, sl_distance, tp_distance
from mt5_utils import (connect, fetch_bars_5m, fetch_bars_30m, fetch_bars_daily,
                       fetch_price, get_balance, get_open_positions, place_order,
                       pip_size, london_now)
from levels    import (compute_asia_range, compute_monday_range, project_fib_levels,
                       detect_confluences, get_yesterday_range_bars)
from engine     import compute_direction
from indicators import compute_atr
from risk       import KillSwitch, within_trade_window, position_size

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-7s  %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('backtestSystem.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

_DEFAULT_POLL    = 2   # fallback if not in config
_STATUS_INTERVAL = 30  # seconds between heartbeat logs per pair
_last_status: dict[str, float] = {}  # pair → last status log timestamp


# ── KV credential fetch ───────────────────────────────────────────────────────

def _load_creds_from_kv(dashboard_url: str) -> dict | None:
    """
    Fetch backtestsystem_credentials from the dashboard KV API.
    Returns a dict with mt5_account / mt5_password / mt5_server / mt5_path,
    or None if unavailable.
    """
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


# ── KV status push ───────────────────────────────────────────────────────────

def _push_status_to_kv(dashboard_url: str, status: dict) -> None:
    try:
        payload = json.dumps({
            'key':       'backtestsystem_status',
            'data':      status,
            'timestamp': int(time.time() * 1000),
        }).encode()
        req = urllib.request.Request(
            f'{dashboard_url.rstrip("/")}/api/kv/set',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception as exc:
        log.warning(f'KV status push failed: {exc}')


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pair_has_open(symbol: str, positions: list) -> bool:
    return any(p.symbol == symbol for p in positions)


def _level_key(pair: str, price: float, pip: float) -> str:
    """Snap price to a 2-pip grid so nearby touches share the same key."""
    rounded = round(price / (pip * 2)) * (pip * 2)
    return f'{pair}:{rounded:.6f}'


# ── Per-pair evaluation ───────────────────────────────────────────────────────

def run_pair(pair: str, cfg: dict, kill: KillSwitch,
             level_entries: dict, today_date: str, london_hour: int,
             can_trade: bool = True) -> dict:
    """Returns a status dict for KV push; empty dict if skipped before levels computed."""
    st: dict = {'pair': pair, 'price': None, 'asia': None, 'confluences': [],
                'in_zone': False, 'direction': None, 'conviction': None, 'confirms': None}

    # Asia session runs midnight–06:00 London; levels are only valid once it closes
    if london_hour < 6:
        return st

    pip = pip_size(pair)

    # ── Fetch bars + live price ───────────────────────────────────────────
    bars_5m  = fetch_bars_5m(pair,  count=500)   # ~41h — covers today + yesterday Asia
    bars_30m = fetch_bars_30m(pair, count=500)
    daily    = fetch_bars_daily(pair, count=150)
    price    = fetch_price(pair)
    if not bars_5m or price is None:
        log.debug(f'{pair}: no data — skipping')
        return st

    st['price'] = price

    # ── Session ranges ────────────────────────────────────────────────────
    method = cfg.get('method', 'asia')
    asia   = compute_asia_range(bars_5m, today_date)
    monday = compute_monday_range(bars_30m) if method in ('monday', 'both') else None

    if   method == 'asia'   and not asia:                return st
    elif method == 'monday' and not monday:               return st
    elif method == 'both'   and not asia and not monday:  return st

    if asia:
        st['asia'] = {'high': asia['high'], 'low': asia['low'],
                      'range_pips': round(asia['range'] / pip)}

    # ── Confluence levels ─────────────────────────────────────────────────
    yest_date  = (datetime.strptime(today_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    yest_bars  = get_yesterday_range_bars(bars_5m, today_date)
    yest_asia  = compute_asia_range(yest_bars, yest_date) if yest_bars else None

    today_levels: list = []
    if asia:   today_levels += project_fib_levels(asia)
    if monday: today_levels += project_fib_levels(monday)
    yest_levels = project_fib_levels(yest_asia) if yest_asia else []

    tol_pips    = cfg.get('confTolPips',  2.0)
    price_mode  = cfg.get('priceMode',   'lowest')
    cluster     = cfg.get('clusterMerge', True)
    confluences = detect_confluences(today_levels, yest_levels, pip, tol_pips, price_mode, cluster)

    sig_filter = cfg.get('signalFilter', 'all_conf')
    if   sig_filter == 'tight_only':  confluences = [c for c in confluences if c.get('isTight')]
    elif sig_filter == 'all_levels':  confluences = today_levels

    # ── Heartbeat status log ──────────────────────────────────────────────
    now_ts   = time.monotonic()
    due      = (now_ts - _last_status.get(pair, 0)) >= _STATUS_INTERVAL
    asia_tag = (f'Asia[{asia["low"]:.5f}–{asia["high"]:.5f} {round(asia["range"]/pip)}p]'
                if asia else 'no range')

    range_ref  = asia['range'] if asia else (monday['range'] if monday else pip * 20)
    prox_limit = range_ref * cfg.get('entryProximityATR', 0.30)

    if confluences:
        # Populate status confluences (sorted nearest first, cap at 12)
        st['confluences'] = [
            {'price': round(c['price'], 5),
             'fib':   c.get('fib'),
             'dist_pips': round(abs(c['price'] - price) / pip, 1),
             'above':    c['price'] > price,
             'isTight':  c.get('isTight', False)}
            for c in sorted(confluences, key=lambda c: abs(c['price'] - price))[:12]
        ]
        nearest   = min(confluences, key=lambda c: abs(c['price'] - price))
        dist_pips = abs(nearest['price'] - price) / pip
        in_zone   = dist_pips * pip <= prox_limit
        st['in_zone'] = in_zone
        zone_tag  = '  ◄ IN ZONE' if in_zone else ''
        if due or in_zone:
            log.info(f'{pair}  {price:.5f}  {asia_tag}  '
                     f'nearest={nearest["price"]:.5f} ({dist_pips:.1f}p){zone_tag}')
            _last_status[pair] = now_ts
    else:
        if due:
            log.info(f'{pair}  {price:.5f}  {asia_tag}  no confluences yet')
            _last_status[pair] = now_ts
        return st

    # ── Open position status (always populate so monitor can show it) ────
    open_pos = get_open_positions()
    pair_pos = [p for p in open_pos if p.symbol == pair or p.symbol.startswith(pair)]
    if pair_pos:
        def _nearest_level(open_px: float):
            if not confluences:
                return None, None
            c = min(confluences, key=lambda x: abs(x['price'] - open_px))
            return round(c['price'], 5), c.get('fib')
        st['positions'] = []
        for p in pair_pos:
            lv, fib = _nearest_level(p.price_open)
            st['positions'].append({
                'ticket':     p.ticket,
                'direction':  'long' if p.type == 0 else 'short',
                'lots':       p.volume,
                'open_price': round(p.price_open, 5),
                'sl':         round(p.sl, 5),
                'tp':         round(p.tp, 5),
                'profit':     round(p.profit, 2),
                'level':      lv,
                'level_fib':  fib,
            })
        log.info(f'  {pair}  {len(pair_pos)} position(s) open — skipping new entry')
        return st

    # ── Proximity check ───────────────────────────────────────────────────
    nearby = sorted(
        [c for c in confluences if abs(c['price'] - price) <= prox_limit],
        key=lambda c: abs(c['price'] - price),
    )
    if not nearby:
        return st

    # ── Tight entry tolerance gate ────────────────────────────────────────
    entry_tol   = cfg.get('entryTolPips', 3.0) * pip
    nearest_lev = nearby[0]
    dist_to_lev = abs(nearest_lev['price'] - price)
    if dist_to_lev > entry_tol:
        log.info(f'  {pair}  watching — {dist_to_lev/pip:.1f}p from level '
                 f'{nearest_lev["price"]:.5f} (need ≤{cfg.get("entryTolPips",3.0)}p)')
        return st

    # ── Feature scoring ───────────────────────────────────────────────────
    feature_cfg = cfg.get('features', {})
    result      = compute_direction(bars_5m, bars_30m, daily,
                                    asia, monday, price, pip,
                                    today_date, feature_cfg)
    entry_dir  = result.get('entry_dir')
    conviction = result.get('conviction', 0.0)
    confirms   = result.get('confirm_count', 0)
    conflicts  = result.get('conflict_count', 0)
    atr        = result.get('atr', pip * 20)

    st['direction']  = entry_dir
    st['conviction'] = round(conviction, 2)
    st['confirms']   = confirms

    scored   = result.get('results', [])
    feat_str = '  '.join(f'{r["key"][:8]}{r.get("icon","·")}' for r in scored) or 'no features'
    log.info(f'  {pair}  dir={entry_dir or "none":5s}  conv={conviction:.2f}  '
             f'confirms={confirms} conflicts={conflicts}  [{feat_str}]')

    if not entry_dir:
        return st

    # ── Entry quality filters ─────────────────────────────────────────────
    if conviction < cfg.get('minConviction', 0.20):
        log.info(f'  {pair}  skip — conviction {conviction:.2f} < {cfg["minConviction"]}')
        return st
    if confirms < cfg.get('minConfirms', 3):
        log.info(f'  {pair}  skip — confirms {confirms} < {cfg["minConfirms"]}')
        return st

    # ── Level re-entry cap ────────────────────────────────────────────────
    target_price = nearby[0]['price']
    lkey = _level_key(pair, target_price, pip)
    if level_entries.get(lkey, 0) >= cfg.get('levelReentry', 2):
        log.info(f'  {pair}  skip — re-entry cap reached for {target_price:.5f}')
        return st

    # ── Kill switch ───────────────────────────────────────────────────────
    block = kill.block_reason()
    if block:
        log.warning(f'  {pair}  BLOCKED — {block}')
        return st

    # ── Compute SL / TP ───────────────────────────────────────────────────
    # engine returns the 30m ATR; compute 5m ATR here from newest-first bars
    atr_5m     = compute_atr(list(reversed(bars_5m[:20])))
    atr_30m    = atr   # already the 30m ATR from engine — do NOT multiply again
    asia_range = asia['range'] if asia else (monday['range'] if monday else pip * 20)
    sl_dist    = sl_distance(cfg, atr_5m, atr_30m, asia_range, pip)

    beyond = sorted(
        [c for c in confluences
         if (entry_dir == 'long'  and c['price'] > price + pip) or
            (entry_dir == 'short' and c['price'] < price - pip)],
        key=lambda c: abs(c['price'] - price),
    )
    next_dist = abs(beyond[0]['price'] - price) if beyond else None
    tp_dist   = tp_distance(cfg, sl_dist, pip, asia_range, next_dist)

    sl = round((price - sl_dist) if entry_dir == 'long' else (price + sl_dist), 5)
    tp = round((price + tp_dist) if entry_dir == 'long' else (price - tp_dist), 5)

    # ── Position sizing ───────────────────────────────────────────────────
    balance  = get_balance()
    risk_pct = cfg.get('riskPct', 1.0)
    lots     = position_size(balance, risk_pct, sl_dist, pip, pair)

    # ── Place order (only within trade window) ───────────────────────────────
    if not can_trade:
        log.info(f'  {pair}  signal ready but outside trade window — watching')
        return st

    log.info(
        f'TRADE  {pair} {entry_dir.upper()} @ {price:.5f}  '
        f'SL={sl} ({sl_dist/pip:.1f}p)  TP={tp} ({tp_dist/pip:.1f}p)  '
        f'RR={tp_dist/sl_dist:.1f}  lots={lots}  '
        f'atr5m={atr_5m/pip:.1f}p  atr30m={atr_30m/pip:.1f}p  '
        f'conv={conviction:.2f}  confirms={confirms}/{confirms + conflicts}'
    )
    ticket = place_order(pair, entry_dir, lots, sl, tp)
    level_entries[lkey] = level_entries.get(lkey, 0) + 1  # count attempt win or lose
    if ticket:
        log.info(f'  → ticket #{ticket}')
    else:
        remaining = cfg.get('levelReentry', 2) - level_entries[lkey]
        log.warning(f'  → order rejected — {remaining} attempt(s) left on this level today')

    return st


# ── Main loop ─────────────────────────────────────────────────────────────────

def _load_live_config_from_kv(dashboard_url: str) -> dict | None:
    """Fetch backtestsystem_live_config from KV (risk%, kill switches, pairs, windows)."""
    try:
        url = f'{dashboard_url.rstrip("/")}/api/kv/get?key=backtestsystem_live_config'
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get('miss') or not data.get('data'):
            return None
        return data['data']
    except Exception as exc:
        log.warning(f'Could not load live config from KV: {exc}')
        return None


def main() -> None:
    cfg = load_config()

    # Try KV first (set DASHBOARD_URL in .env), fall back to individual env vars
    dashboard_url = os.getenv('DASHBOARD_URL', '')
    kv_creds = _load_creds_from_kv(dashboard_url) if dashboard_url else None

    if kv_creds:
        log.info('Loaded MT5 credentials from dashboard KV')
        mt5_account  = int(kv_creds.get('mt5_account') or 0)
        mt5_password = kv_creds.get('mt5_password', '')
        mt5_server   = kv_creds.get('mt5_server',   '')
        mt5_path     = kv_creds.get('mt5_path',     '')
    else:
        mt5_account  = int(os.getenv('MT5_ACCOUNT', '0'))
        mt5_password = os.getenv('MT5_PASSWORD', '')
        mt5_server   = os.getenv('MT5_SERVER',   '')
        mt5_path     = os.getenv('MT5_PATH',     '')

    # Merge live config from KV on top of active.json (survives strategy config exports)
    if dashboard_url:
        live_cfg = _load_live_config_from_kv(dashboard_url)
        if live_cfg:
            cfg.update(live_cfg)
            log.info(f'Live config loaded from KV: risk={live_cfg.get("riskPct")}%  '
                     f'pairs={live_cfg.get("enabledPairs")}  '
                     f'kill D={live_cfg.get("killDaily")} W={live_cfg.get("killWeekly")}')

    if not connect(mt5_account, mt5_password, mt5_server, mt5_path):
        log.error('MT5 connection failed — check .env and MT5 terminal')
        sys.exit(1)

    pairs        = cfg.get('enabledPairs', [])
    kill         = KillSwitch(cfg)
    poll_interval = int(cfg.get('pollInterval', _DEFAULT_POLL))

    log.info('=== backtestSystem started ===')
    log.info(f'Dashboard URL: {dashboard_url or "(not set — monitor disabled)"}')
    log.info(f'Pairs: {pairs}  poll={poll_interval}s')
    log.info(f'Method: {cfg.get("method")}  SL: {cfg.get("slMode")}  TP: {cfg.get("tpMode")}  RR: {cfg.get("rrRatio")}')
    log.info(f'Kill: D={cfg.get("killDaily")}R  W={cfg.get("killWeekly")}R  M={cfg.get("killMonthly")}R')
    enabled_features = [k for k, v in cfg.get('features', {}).items() if v.get('enabled')]
    log.info(f'Features ({len(enabled_features)}): {", ".join(enabled_features)}')

    level_entries: dict = {}
    last_date = ''

    while True:
        try:
            now        = london_now()
            today_date = now['lDate']

            if today_date != last_date:
                level_entries = {}
                last_date     = today_date
                log.info(f'--- New day {today_date} ---  {kill.summary()}')

            in_window = within_trade_window(cfg)

            pair_statuses: dict = {}
            for pair in pairs:
                try:
                    st = run_pair(pair, cfg, kill, level_entries, today_date,
                                  now['lHour'], can_trade=in_window)
                    if st.get('price') is not None:
                        pair_statuses[pair] = st
                except Exception as exc:
                    log.exception(f'{pair}: error — {exc}')

            if dashboard_url:
                _push_status_to_kv(dashboard_url, {
                    'timestamp': int(time.time() * 1000),
                    'date':      today_date,
                    'in_window': in_window,
                    'pairs':     pair_statuses,
                })

        except KeyboardInterrupt:
            log.info('Stopped.')
            break
        except Exception as exc:
            log.exception(f'Main loop: {exc}')

        time.sleep(poll_interval)


if __name__ == '__main__':
    main()
