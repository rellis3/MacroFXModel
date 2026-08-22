"""
backtestSystem/main.py — MT5 trading loop.
Config priority: dashboard KV (backtestsystem_live_config) > local configs/active.json > built-in defaults.
Set DASHBOARD_URL in .env to enable KV config and credentials. configs/active.json is optional.
"""

import json
import logging
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta

from dotenv import load_dotenv

from config    import load_config, sl_distance, tp_distance, chandelier_stop, _deep_merge
from mt5_utils import (connect, fetch_bars_5m, fetch_bars_30m, fetch_bars_daily,
                       fetch_price, get_balance, get_open_positions, place_order,
                       pip_size, london_now, move_sl_to_be, modify_sl, fetch_close_price,
                       tz_offset_sec, serialize_closed_trades)
import journal
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
_trail_peaks: dict[int, float] = {}  # ticket → best price since entry (chandelier trail)

# ── Server regime cache ───────────────────────────────────────────────────────
# Fetched from /api/hmm5m on the Railway server; refreshed every 5 min.
_regime_cache:       dict  = {}   # symbol → { regime, pBull, pBear, pRange, confidence }
_regime_cache_at:    float = 0.0  # monotonic timestamp of last successful fetch
_REGIME_CACHE_TTL   = 5 * 60     # seconds


def _fetch_server_regimes(dashboard_url: str) -> None:
    """Pull 1m HMM regimes from Railway /api/hmm5m and cache them."""
    global _regime_cache, _regime_cache_at
    now = time.monotonic()
    if now - _regime_cache_at < _REGIME_CACHE_TTL:
        return
    try:
        url = f'{dashboard_url.rstrip("/")}/api/hmm5m'
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        if isinstance(data, dict):
            _regime_cache    = data
            _regime_cache_at = now
            log.debug(f'[Regime] Fetched {len(data)} pairs from server')
    except Exception as exc:
        log.warning(f'[Regime] Could not fetch server regimes: {exc}')


def _regime_veto(pair: str, entry_dir: str, cfg: dict) -> str | None:
    """
    Return a veto reason string if the 1m HMM on the server strongly opposes
    the intended entry direction, otherwise None.

    Logic:
      - Only veto when useServerRegime=True in config
      - RANGE regime → never veto (mean-reversion is valid from either side)
      - BULL + short entry  or  BEAR + long entry → veto when confidence ≥ threshold
    """
    if not cfg.get('useServerRegime', False):
        return None

    # Normalise pair to the key format the server uses (e.g. 'EUR/USD')
    sym = pair if '/' in pair else f'{pair[:3]}/{pair[3:]}'
    r   = _regime_cache.get(sym)
    if not r:
        return None

    regime     = r.get('regime', 'RANGE')
    confidence = r.get('confidence', 0)
    threshold  = cfg.get('regimeVetoConfidence', 70)

    if regime == 'RANGE':
        return None  # range = mean-reversion fine in any direction

    if confidence < threshold:
        return None

    if regime == 'BULL' and entry_dir == 'short':
        return f'HMM1m BULL {confidence}% — vetoing SHORT'
    if regime == 'BEAR' and entry_dir == 'long':
        return f'HMM1m BEAR {confidence}% — vetoing LONG'
    return None


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
             open_pos: list = None, cooldown_until: float = 0.0,
             can_trade: bool = True,
             placed_tickets: dict = None) -> dict:
    """Returns a status dict for KV push; empty dict if skipped before levels computed.

    placed_tickets: if provided, any newly placed ticket is injected here so the
    main loop's close-detection tracks it from the very next poll — guarding against
    MT5 positions_get() briefly not returning a just-placed position.
    """
    st: dict = {'pair': pair, 'price': None, 'asia': None, 'confluences': [],
                'in_zone': False, 'direction': None, 'conviction': None, 'confirms': None}

    # Asia session runs midnight–06:00 London; levels are only valid once it closes
    if london_hour < 6:
        return st

    pip = pip_size(pair)

    # ── Fetch bars + live price ───────────────────────────────────────────
    bars_5m  = fetch_bars_5m(pair,  count=750)   # ~62h — covers today + yesterday Asia at any hour
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
    yest_bars  = get_yesterday_range_bars(bars_5m, today_date)
    # Use the actual date from the bars — not a calendar subtraction — so Monday
    # resolves to Friday rather than Sunday (no-trade day).
    yest_date  = (yest_bars[0]['lDate'] if yest_bars else
                  (datetime.strptime(today_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d'))
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
            if not yest_asia:
                n_yest = len([b for b in yest_bars if 0 <= b.get('lHour', 24) < 6])
                log.info(f'{pair}  {price:.5f}  {asia_tag}  '
                         f'no confluences — yest Asia missing (only {n_yest}/36 Asia bars)')
            else:
                yest_tag = f'{yest_asia["low"]:.5f}–{yest_asia["high"]:.5f} {round(yest_asia["range"]/pip)}p'
                log.info(f'{pair}  {price:.5f}  {asia_tag}  '
                         f'no confluences — today={len(today_levels)} levels  '
                         f'yest Asia[{yest_tag}]={len(yest_levels)} levels  '
                         f'tol={tol_pips}p')
            _last_status[pair] = now_ts
        return st

    # ── Open position status (always populate so monitor can show it) ────
    if open_pos is None:
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
            entry_ts_ms = journal.get_entry_ts_ms(p.ticket)
            if entry_ts_ms is not None:
                journal.accumulate_bars(p.ticket, bars_5m, entry_ts_ms)
        log.info(f'  {pair}  {len(pair_pos)} position(s) open — skipping new entry')
        return st

    # ── Trade cooldown ────────────────────────────────────────────────────
    now_mono = time.monotonic()
    if cooldown_until > now_mono:
        mins_left = int((cooldown_until - now_mono) / 60) + 1
        log.info(f'  {pair}  cooldown — {mins_left}m remaining after last trade')
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
    # Independence count: at most one confirm per feature family (trend /
    # divergence / structure / other — see engine.FEATURE_FAMILY). The raw
    # `confirms` treats correlated detectors (MACD + HTF-EMA + ADX + TWAP all
    # reading the same trend) as independent votes; the gate must not.
    fam_confirms = result.get('family_confirm_count', confirms)
    conflicts  = result.get('conflict_count', 0)
    atr        = result.get('atr', pip * 20)

    st['direction']  = entry_dir
    st['conviction'] = round(conviction, 2)
    st['confirms']   = confirms

    scored   = result.get('results', [])
    feat_str = '  '.join(f'{r["key"][:8]}{r.get("icon","·")}' for r in scored) or 'no features'
    log.info(f'  {pair}  dir={entry_dir or "none":5s}  conv={conviction:.2f}  '
             f'confirms={confirms} (families={fam_confirms}) conflicts={conflicts}  [{feat_str}]')

    if not entry_dir:
        return st

    # ── Entry quality filters ─────────────────────────────────────────────
    if conviction < cfg.get('minConviction', 0.20):
        log.info(f'  {pair}  skip — conviction {conviction:.2f} < {cfg["minConviction"]}')
        return st
    if fam_confirms < cfg.get('minConfirms', 3):
        log.info(f'  {pair}  skip — family confirms {fam_confirms} '
                 f'(raw {confirms}) < {cfg["minConfirms"]}')
        return st

    # ── Server regime veto (1m HMM from Railway) ──────────────────────────
    veto = _regime_veto(pair, entry_dir, cfg)
    if veto:
        log.info(f'  {pair}  skip — {veto}')
        return st

    # ── Level re-entry cap ────────────────────────────────────────────────
    target_price = nearby[0]['price']
    lkey = _level_key(pair, target_price, pip)
    if level_entries.get(lkey, 0) >= cfg.get('levelReentry', 2):
        log.info(f'  {pair}  skip — re-entry cap reached for {target_price:.5f}')
        return st

    # ── Kill switch ───────────────────────────────────────────────────────
    # Pass live balance so the close-detection-independent % drawdown guard works
    # (catches SL/TP hits the bot never journalled — e.g. during a restart).
    block = kill.block_reason(get_balance())
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
    lots     = position_size(balance, risk_pct, sl_dist, pip, pair, price=price)

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

    if cfg.get('paper_mode', False):
        log.info(f'  → PAPER MODE — order not sent to MT5')
        return st

    ticket = place_order(pair, entry_dir, lots, sl, tp)
    level_entries[lkey] = level_entries.get(lkey, 0) + 1  # count attempt win or lose
    if ticket:
        log.info(f'  → ticket #{ticket}')
        kill.record_open()               # count toward the daily trade cap
        if placed_tickets is not None:
            placed_tickets[ticket] = pair  # guard against MT5 positions_get() lag
        features_fired = [r['key'] for r in scored if r.get('icon', '·') != '·']
        journal.record_open(
            ticket, pair, entry_dir, price, sl, tp, lots, pip,
            nearest_lev['price'], nearest_lev.get('fib'),
            conviction, confirms, features_fired,
        )
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

    # Merge live config from KV on top of active.json / DEFAULTS.
    # KV always wins — this is the primary config path when DASHBOARD_URL is set.
    if dashboard_url:
        live_cfg = _load_live_config_from_kv(dashboard_url)
        if live_cfg:
            cfg = _deep_merge(cfg, live_cfg)
            log.info(f'Live config loaded from dashboard KV (backtestsystem_live_config): '
                     f'risk={live_cfg.get("riskPct")}%  '
                     f'pairs={live_cfg.get("enabledPairs")}  '
                     f'kill D={live_cfg.get("killDaily")} W={live_cfg.get("killWeekly")}')
        else:
            log.warning('No backtestsystem_live_config in KV — running on built-in defaults. '
                        'Save config from the dashboard bot-config page to populate it.')

    # flipOnSL defaults to False (Batch 6): reversing on a stop-out has no
    # validation evidence and doubles cost drag at failed levels. If the owner
    # explicitly turned it on in active.json / KV, honour it — but say so loudly.
    if cfg.get('flipOnSL'):
        log.warning('flipOnSL is ENABLED (owner opt-in, no validation evidence) — '
                    'stop-outs will reverse position and pay a second round of costs.')

    if not connect(mt5_account, mt5_password, mt5_server, mt5_path):
        log.error('MT5 connection failed — check .env and MT5 terminal')
        sys.exit(1)

    journal.init(dashboard_url)

    pairs        = cfg.get('enabledPairs', [])
    # Persist the kill-switch across restarts (the live bug: it was in-memory,
    # the bot restarts often, so the daily loss counter zeroed before it tripped).
    kill         = KillSwitch(cfg, state_path=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'killswitch_state.json'))
    poll_interval = int(cfg.get('pollInterval', _DEFAULT_POLL))

    log.info('=== backtestSystem started ===')
    log.info(f'Dashboard URL: {dashboard_url or "(not set — monitor disabled)"}')
    log.info(f'Pairs: {pairs}  poll={poll_interval}s')
    log.info(f'Method: {cfg.get("method")}  SL: {cfg.get("slMode")}  TP: {cfg.get("tpMode")}  RR: {cfg.get("rrRatio")}')
    log.info(f'Kill: D={cfg.get("killDaily")}R  W={cfg.get("killWeekly")}R  M={cfg.get("killMonthly")}R')
    log.info(f'Cooldown: {cfg.get("tradeCooldownMins")}m  slToBePct={cfg.get("slToBePct")}  regime={cfg.get("useServerRegime")}  poll={cfg.get("pollInterval")}s')
    if cfg.get('chandelierEnabled'):
        log.info(f'Chandelier trail: ON  width={cfg.get("chandelierAtrMult")}×ATR  '
                 f'activate={cfg.get("chandelierActivateAtr")}×ATR')
    enabled_features = [k for k, v in cfg.get('features', {}).items() if v.get('enabled')]
    log.info(f'Features ({len(enabled_features)}): {", ".join(enabled_features)}')

    level_entries:    dict = {}
    pair_close_times: dict = {}   # pair → monotonic timestamp of last close
    prev_tickets:     dict = {}   # ticket_id → symbol
    last_date = ''

    cooldown_secs = cfg.get('tradeCooldownMins', 30) * 60

    while True:
        try:
            now        = london_now()
            today_date = now['lDate']

            if today_date != last_date:
                level_entries = {}
                last_date     = today_date
                kill.set_balance(get_balance())   # anchor day-start balance for the % drawdown guard
                log.info(f'--- New day {today_date} ---  {kill.summary()}')

            in_window = within_trade_window(cfg)

            # Refresh server HMM regime cache if useServerRegime is on
            if dashboard_url and cfg.get('useServerRegime', False):
                _fetch_server_regimes(dashboard_url)

            # Fetch positions once; detect any that closed since last poll
            open_pos = get_open_positions()
            current_tickets = {p.ticket: p.symbol for p in open_pos}
            for ticket, symbol in prev_tickets.items():
                if ticket not in current_tickets:
                    _trail_peaks.pop(ticket, None)  # drop chandelier peak for closed trade
                    for pair in pairs:
                        if symbol == pair or symbol.startswith(pair):
                            pair_close_times[pair] = time.monotonic()
                            log.info(f'{pair}  position #{ticket} closed — {cooldown_secs//60:.0f}m cooldown started')
                            exit_price = fetch_close_price(ticket)
                            if exit_price:
                                pnl_r = journal.record_close(ticket, exit_price)
                                if pnl_r is not None:
                                    kill.record(pnl_r)
                                    log.info(f'{pair}  kill-switch fed {pnl_r:+.2f}R — {kill.summary()}')
            prev_tickets = current_tickets

            # ── SL → Breakeven management ─────────────────────────────────
            be_pct = cfg.get('slToBePct', 0.0)
            if be_pct > 0.0:
                for pos in open_pos:
                    entry, sl, tp = pos.price_open, pos.sl, pos.tp
                    if tp == 0 or sl == 0:
                        continue
                    is_long   = pos.type == 0
                    tp_dist   = abs(tp - entry)
                    if tp_dist == 0:
                        continue
                    price_now = fetch_price(pos.symbol) or entry
                    moved     = (price_now - entry) if is_long else (entry - price_now)
                    progress  = moved / tp_dist
                    if progress >= be_pct:
                        be_moved = move_sl_to_be(pos, pip_size(pos.symbol),
                                                  cfg.get('slBeBuffer', 1.0))
                        if be_moved:
                            _p   = pip_size(pos.symbol)
                            _buf = cfg.get('slBeBuffer', 1.0) * _p
                            _be  = pos.price_open + _buf if pos.type == 0 else pos.price_open - _buf
                            journal.record_be_move(pos.ticket, round(_be, 6))

            # ── Chandelier trailing stop ───────────────────────────────────
            # Ratchet each open position's SL behind the best price reached, so a
            # runner that never touches the far fixed TP still locks in profit
            # instead of round-tripping. Runs every poll, regardless of the trade
            # window; the fixed TP stays as a ceiling. Favourable-ratchet-only, so
            # it composes safely with SL→BE (whichever is tighter wins).
            if cfg.get('chandelierEnabled', False):
                atr_mult   = cfg.get('chandelierAtrMult', 3.0)
                act_atr    = cfg.get('chandelierActivateAtr', 1.0)
                atr_period = int(cfg.get('atrPeriod', 14))
                live_tickets = {p.ticket for p in open_pos}
                for pos in open_pos:
                    if pos.sl == 0:
                        continue  # no protective stop set — leave the trail off
                    is_long   = pos.type == 0
                    entry     = pos.price_open
                    price_now = fetch_price(pos.symbol) or pos.price_current or entry
                    peak      = _trail_peaks.get(pos.ticket)
                    if peak is None:
                        peak = max(entry, price_now) if is_long else min(entry, price_now)
                    else:
                        peak = max(peak, price_now) if is_long else min(peak, price_now)
                    _trail_peaks[pos.ticket] = peak

                    # 30m ATR — the same estimator that set the SL at entry.
                    bars_30m = fetch_bars_30m(pos.symbol, count=atr_period * 4 + 10)
                    atr = compute_atr(bars_30m[-(atr_period * 3):], atr_period) if bars_30m else 0.0
                    if not atr:
                        continue

                    new_sl = chandelier_stop(is_long, entry, peak, atr, pos.sl,
                                             atr_mult, act_atr)
                    if new_sl is None:
                        continue
                    set_sl = modify_sl(pos, new_sl)
                    if set_sl is not None:
                        _p   = pip_size(pos.symbol)
                        lock = (set_sl - entry) / _p if is_long else (entry - set_sl) / _p
                        log.info(f'Chandelier  ticket={pos.ticket} {pos.symbol}  '
                                 f'SL→{set_sl}  peak={peak:.5f}  atr={atr/_p:.1f}p  '
                                 f'locked={lock:+.1f}p')
                        journal.record_trail_move(pos.ticket, set_sl)

                # Belt & braces: drop peaks for any ticket no longer open (the
                # close detector above is the primary cleanup).
                for t in list(_trail_peaks):
                    if t not in live_tickets:
                        _trail_peaks.pop(t, None)

            pair_statuses: dict = {}
            for pair in pairs:
                try:
                    cooldown_until = pair_close_times.get(pair, 0) + cooldown_secs
                    st = run_pair(pair, cfg, kill, level_entries, today_date,
                                  now['lHour'], open_pos=open_pos,
                                  cooldown_until=cooldown_until, can_trade=in_window,
                                  placed_tickets=current_tickets)
                    if st.get('price') is not None:
                        pair_statuses[pair] = st
                except Exception as exc:
                    log.exception(f'{pair}: error — {exc}')

            if dashboard_url:
                _push_status_to_kv(dashboard_url, {
                    'timestamp':     int(time.time() * 1000),
                    'date':          today_date,
                    'in_window':     in_window,
                    'paper_mode':    cfg.get('paper_mode', True),
                    'pairs':         pair_statuses,
                    'mt5_positions': [
                        {
                            'ticket':     p.ticket,
                            'symbol':     p.symbol,
                            'direction':  'BUY' if p.type == 0 else 'SELL',
                            'lots':       p.volume,
                            'open_price': round(p.price_open, 5),
                            'price':      round(p.price_current, 5),
                            'profit':     round(p.profit, 2),
                            'swap':       round(p.swap, 2),
                            'time_open':  int(p.time),
                            'tz_offset_sec': tz_offset_sec(),
                            'comment':    str(p.comment or ''),
                        }
                        for p in open_pos
                    ],
                    # Closed positions matter as much as open ones: the dashboard's
                    # `mergeTradeHistory()` only files a bot's trades into
                    # trade_hist_<key>_<date> when its status push carries this
                    # field. Without it the bot's trades show in the live table
                    # while open and then vanish for good on close.
                    'today_closed_trades': serialize_closed_trades(),
                })

        except KeyboardInterrupt:
            log.info('Stopped.')
            break
        except Exception as exc:
            log.exception(f'Main loop: {exc}')

        time.sleep(poll_interval)


if __name__ == '__main__':
    main()
