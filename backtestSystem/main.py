"""
backtestSystem/main.py — MT5 trading loop.
Completely separate from the main bot; no KV / Railway dependency.
Reads configs/active.json, connects to MT5, polls every 60 s.
"""

import logging
import os
import sys
import time
from datetime import datetime, timedelta

from dotenv import load_dotenv

from config    import load_config, sl_distance, tp_distance
from mt5_utils import (connect, fetch_bars_5m, fetch_bars_30m, fetch_bars_daily,
                       fetch_price, get_balance, get_open_positions, place_order,
                       pip_size, london_now)
from levels    import (compute_asia_range, compute_monday_range, project_fib_levels,
                       detect_confluences, get_yesterday_range_bars)
from engine    import compute_direction
from risk      import KillSwitch, within_trade_window, position_size

load_dotenv()

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

POLL_INTERVAL = 60  # seconds between pair scans


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pair_has_open(symbol: str, positions: list) -> bool:
    return any(p.symbol == symbol for p in positions)


def _level_key(pair: str, price: float, pip: float) -> str:
    """Snap price to a 2-pip grid so nearby touches share the same key."""
    rounded = round(price / (pip * 2)) * (pip * 2)
    return f'{pair}:{rounded:.6f}'


# ── Per-pair evaluation ───────────────────────────────────────────────────────

def run_pair(pair: str, cfg: dict, kill: KillSwitch,
             level_entries: dict, today_date: str) -> None:
    pip = pip_size(pair)

    # ── Fetch bars + live price ───────────────────────────────────────────
    bars_5m  = fetch_bars_5m(pair,  count=350)
    bars_30m = fetch_bars_30m(pair, count=350)
    daily    = fetch_bars_daily(pair, count=150)
    price    = fetch_price(pair)
    if not bars_5m or price is None:
        log.debug(f'{pair}: no data — skipping')
        return

    # ── Session ranges ────────────────────────────────────────────────────
    method = cfg.get('method', 'asia')
    asia   = compute_asia_range(bars_5m, today_date)
    monday = compute_monday_range(bars_30m) if method in ('monday', 'both') else None

    if   method == 'asia'   and not asia:            return
    elif method == 'monday' and not monday:           return
    elif method == 'both'   and not asia and not monday: return

    # ── Confluence levels ─────────────────────────────────────────────────
    yest_date = (datetime.strptime(today_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    yest_bars  = get_yesterday_range_bars(bars_5m, today_date)
    yest_asia  = compute_asia_range(yest_bars, yest_date) if yest_bars else None

    today_levels: list = []
    if asia:   today_levels += project_fib_levels(asia)
    if monday: today_levels += project_fib_levels(monday)
    yest_levels = project_fib_levels(yest_asia) if yest_asia else []

    tol_pips   = cfg.get('confTolPips',  2.0)
    price_mode = cfg.get('priceMode',   'lowest')
    cluster    = cfg.get('clusterMerge', True)
    confluences = detect_confluences(today_levels, yest_levels, pip, tol_pips, price_mode, cluster)

    sig_filter = cfg.get('signalFilter', 'all_conf')
    if   sig_filter == 'tight_only':  confluences = [c for c in confluences if c.get('isTight')]
    elif sig_filter == 'all_levels':  confluences = today_levels  # no confluence required

    if not confluences:
        return

    # ── Proximity to nearest confluence ───────────────────────────────────
    range_ref  = asia['range'] if asia else (monday['range'] if monday else pip * 20)
    prox_limit = range_ref * cfg.get('entryProximityATR', 0.30)
    nearby     = sorted(
        [c for c in confluences if abs(c['price'] - price) <= prox_limit],
        key=lambda c: abs(c['price'] - price),
    )
    if not nearby:
        return

    # ── Feature scoring ───────────────────────────────────────────────────
    feature_cfg = cfg.get('features', {})
    result      = compute_direction(bars_5m, bars_30m, daily,
                                    asia, monday, price, pip,
                                    today_date, feature_cfg)
    entry_dir   = result.get('entry_dir')
    conviction  = result.get('conviction', 0.0)
    confirms    = result.get('confirm_count', 0)
    atr         = result.get('atr', pip * 20)

    if not entry_dir:
        return

    # ── Entry quality filters ─────────────────────────────────────────────
    if conviction < cfg.get('minConviction', 0.20):
        log.debug(f'{pair}: conviction {conviction:.2f} < {cfg["minConviction"]} — skip')
        return
    if confirms < cfg.get('minConfirms', 3):
        log.debug(f'{pair}: confirms {confirms} < {cfg["minConfirms"]} — skip')
        return

    # ── Level re-entry cap ────────────────────────────────────────────────
    target_price = nearby[0]['price']
    lkey = _level_key(pair, target_price, pip)
    if level_entries.get(lkey, 0) >= cfg.get('levelReentry', 2):
        log.info(f'{pair}: re-entry cap reached for level {target_price:.5f} — skip')
        return

    # ── Existing position guard ───────────────────────────────────────────
    open_pos = get_open_positions()
    if _pair_has_open(pair, open_pos):
        return

    # ── Kill switch ───────────────────────────────────────────────────────
    block = kill.block_reason()
    if block:
        log.warning(f'{pair}: {block}')
        return

    # ── Compute SL / TP ───────────────────────────────────────────────────
    atr_30m    = atr * 1.5          # rough 30m proxy; real fetch would be separate
    asia_range = asia['range'] if asia else (monday['range'] if monday else pip * 20)
    sl_dist    = sl_distance(cfg, atr, atr_30m, asia_range, pip)

    # Nearest level beyond entry for structural TP
    beyond = [
        c for c in confluences
        if (entry_dir == 'long'  and c['price'] > price + pip) or
           (entry_dir == 'short' and c['price'] < price - pip)
    ]
    next_dist = abs(beyond[0]['price'] - price) if beyond else None
    tp_dist   = tp_distance(cfg, sl_dist, pip, asia_range, next_dist)

    sl = round((price - sl_dist) if entry_dir == 'long' else (price + sl_dist), 5)
    tp = round((price + tp_dist) if entry_dir == 'long' else (price - tp_dist), 5)

    # ── Position sizing ───────────────────────────────────────────────────
    balance  = get_balance()
    risk_pct = cfg.get('riskPct', 1.0)
    lots     = position_size(balance, risk_pct, sl_dist, pip, pair)

    # ── Place order ───────────────────────────────────────────────────────
    log.info(
        f'TRADE  {pair} {entry_dir.upper()} @ {price:.5f}  '
        f'SL={sl}  TP={tp}  lots={lots}  '
        f'conviction={conviction:.2f}  confirms={confirms}/{confirms + result.get("conflict_count",0)}'
    )
    ticket = place_order(pair, entry_dir, lots, sl, tp)
    if ticket:
        level_entries[lkey] = level_entries.get(lkey, 0) + 1
        log.info(f'  → ticket #{ticket}')


# ── Main loop ─────────────────────────────────────────────────────────────────

def main() -> None:
    cfg = load_config()

    mt5_account  = int(os.getenv('MT5_ACCOUNT', '0'))
    mt5_password = os.getenv('MT5_PASSWORD', '')
    mt5_server   = os.getenv('MT5_SERVER',   '')
    mt5_path     = os.getenv('MT5_PATH',     '')

    if not connect(mt5_account, mt5_password, mt5_server, mt5_path):
        log.error('MT5 connection failed — check .env and MT5 terminal')
        sys.exit(1)

    pairs = cfg.get('enabledPairs', [])
    kill  = KillSwitch(cfg)

    log.info('=== backtestSystem started ===')
    log.info(f'Pairs: {pairs}')
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

            if not within_trade_window(cfg):
                time.sleep(POLL_INTERVAL)
                continue

            for pair in pairs:
                try:
                    run_pair(pair, cfg, kill, level_entries, today_date)
                except Exception as exc:
                    log.exception(f'{pair}: error — {exc}')

        except KeyboardInterrupt:
            log.info('Stopped.')
            break
        except Exception as exc:
            log.exception(f'Main loop: {exc}')

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
