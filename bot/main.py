"""
MacroFX Trading Bot  —  orchestrator
Polls /api/state from the dashboard, runs pluggable analysis modules,
executes via MetaTrader5 (or logs in paper mode).

Usage:
  python main.py            # paper mode (safe default)
  python main.py --live     # send real orders to MT5
  python main.py --once     # single loop then exit (testing)
  python main.py --interval 60   # override poll interval (seconds)
"""

import argparse
import logging
import time
from datetime import datetime, timezone

from utils.state_reader import fetch_state, check_staleness, push_bot_status, StaleDataError
from utils.sl_tp_engine import SLTPEngine
from modules.vol_gate import VolGateModule
from modules.macro_regime import MacroRegimeModule
from modules.confluence import ConfluenceModule
from modules.oi_walls import OIWallsModule
from modules.cot_filter import COTFilterModule
from modules.news_risk import NewsRiskModule

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('bot.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)

# ── Module registry ───────────────────────────────────────────────────────────
# Order matters — hard-blocking modules run first.
MODULE_ORDER = ['vol_gate', 'macro_regime', 'confluence', 'oi_walls', 'cot_filter', 'news_risk']

MODULE_REGISTRY = {
    'vol_gate':     VolGateModule,
    'macro_regime': MacroRegimeModule,
    'confluence':   ConfluenceModule,
    'oi_walls':     OIWallsModule,
    'cot_filter':   COTFilterModule,
    'news_risk':    NewsRiskModule,
}


# ── Module runner ─────────────────────────────────────────────────────────────

def run_modules(state: dict, pair: str, config: dict) -> tuple:
    """
    Returns (results_dict, ctx_dict).
    ctx_dict is None if a hard-blocking module fired.
    """
    enabled = config.get('modules') or {}
    modules = [
        MODULE_REGISTRY[name]()
        for name in MODULE_ORDER
        if enabled.get(name, False) and name in MODULE_REGISTRY
    ]

    results: dict = {}
    ctx: dict = {}

    for module in modules:
        try:
            result = module.evaluate(state, pair, config, ctx)
        except Exception as exc:
            log.error(f'  [{pair}] {module.name} raised: {exc}', exc_info=True)
            continue

        results[module.name] = result
        ctx[module.name] = result

        status = 'PASS' if result.passed else 'BLOCK'
        log.info(f'  [{pair}] {module.name:14s} {status:5s} {result.signal:7s} {result.confidence:6s} {result.reason}')

        if not result.passed and result.signal == 'BLOCK':
            log.info(f'  [{pair}] Hard block from {module.name} — pair skipped')
            return results, None  # signal caller to skip

    return results, ctx


# ── Composite decision ────────────────────────────────────────────────────────

def composite_decision(results: dict) -> tuple:
    """
    Returns (direction | None, avg_score, reason_str).
    direction is LONG, SHORT, or None (no trade).
    """
    passing = {k: v for k, v in results.items() if v and v.passed}
    if not passing:
        return None, 0.0, 'No modules passed'

    long_scores  = [v.score for v in passing.values() if v.signal == 'LONG']
    short_scores = [v.score for v in passing.values() if v.signal == 'SHORT']

    if long_scores and short_scores:
        return None, 0.0, 'Mixed signals — LONG and SHORT both present'

    if long_scores:
        avg = sum(long_scores) / len(long_scores)
        return 'LONG', avg, f'LONG composite {avg:.2f} from {len(long_scores)} module(s)'
    if short_scores:
        avg = sum(short_scores) / len(short_scores)
        return 'SHORT', avg, f'SHORT composite {avg:.2f} from {len(short_scores)} module(s)'

    return None, 0.0, 'Passing modules all NEUTRAL — no directional signal'


# ── Action handler (news risk, etc.) ─────────────────────────────────────────

def handle_actions(results: dict, paper_mode: bool) -> None:
    for name, result in results.items():
        if not result or not result.action:
            continue
        log.info(f'Action triggered by {name}: {result.action}')
        if paper_mode:
            log.info(f'[PAPER] Would execute action: {result.action}')
            continue
        if result.action == 'move_sl_to_breakeven':
            _mt5_move_sl_to_be()
        elif result.action == 'close_all':
            _mt5_close_all()


# ── Trade window check ────────────────────────────────────────────────────────

def within_trade_window(config: dict) -> bool:
    safety = config.get('safety') or {}
    start  = safety.get('trade_window_start', '07:00')
    end    = safety.get('trade_window_end', '20:00')
    now    = datetime.now(timezone.utc).strftime('%H:%M')
    return start <= now <= end


# ── MT5 helpers ───────────────────────────────────────────────────────────────

def _mt5_move_sl_to_be() -> None:
    if not HAS_MT5:
        return
    for pos in mt5.positions_get() or []:
        if pos.sl != pos.price_open:
            mt5.order_send({
                'action': mt5.TRADE_ACTION_SLTP,
                'position': pos.ticket,
                'sl': pos.price_open,
                'tp': pos.tp,
            })
            log.info(f'Moved SL to breakeven: ticket {pos.ticket}')


def _mt5_close_all() -> None:
    if not HAS_MT5:
        return
    for pos in mt5.positions_get() or []:
        order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(pos.symbol)
        price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
        mt5.order_send({
            'action':   mt5.TRADE_ACTION_DEAL,
            'symbol':   pos.symbol,
            'volume':   pos.volume,
            'type':     order_type,
            'position': pos.ticket,
            'price':    price,
            'deviation': 10,
            'magic':    20260001,
            'comment':  'MacroFX emergency close',
        })
        log.info(f'Emergency close: ticket {pos.ticket}')


# ── Trade execution ───────────────────────────────────────────────────────────

def execute_trade(pair: str, direction: str, entry: dict,
                  sl_tp, size: float, paper_mode: bool) -> bool:
    price = entry.get('price', 0)
    log.info(
        f'TRADE {pair} {direction} @ {price} | '
        f'SL={sl_tp.sl} TP={sl_tp.tp} R:R={sl_tp.rr_ratio} | '
        f'lot={size} | sl_method={sl_tp.sl_method} tp_method={sl_tp.tp_method}'
        + (' [SL CAPPED]' if sl_tp.sl_capped else '')
        + (' [TP CAPPED]' if sl_tp.tp_capped else '')
    )

    if sl_tp.sl_capped:
        log.warning(f'SL was capped at max_sl_pips — verify entry quality for {pair}')
    if sl_tp.tp_capped:
        log.warning(f'TP was capped at max_tp_pips — verify entry quality for {pair}')

    if paper_mode:
        log.info(f'[PAPER] Signal logged — no MT5 order sent')
        return True

    if not HAS_MT5:
        log.error('MT5 library not installed and --live mode requested — install MetaTrader5 package')
        return False

    mt5_sym  = pair.replace('/', '')
    tick     = mt5.symbol_info_tick(mt5_sym)
    if tick is None:
        log.error(f'MT5: no tick data for {mt5_sym}')
        return False

    order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
    exec_price = tick.ask if direction == 'LONG' else tick.bid

    request = {
        'action':      mt5.TRADE_ACTION_DEAL,
        'symbol':      mt5_sym,
        'volume':      size,
        'type':        order_type,
        'price':       exec_price,
        'sl':          sl_tp.sl,
        'tp':          sl_tp.tp,
        'deviation':   10,
        'magic':       20260001,
        'comment':     f'MacroFX {direction[0]} {entry.get("totalStars", 0)}★',
        'type_time':   mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }

    res = mt5.order_send(request)
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f'MT5 order failed: retcode={res.retcode} msg={res.comment}')
        return False

    log.info(f'MT5 order placed: ticket={res.order}')
    return True


# ── Main loop ─────────────────────────────────────────────────────────────────

def main_loop(paper_mode: bool, poll_interval: int, run_once: bool = False) -> None:
    log.info(f'MacroFX Bot starting — paper={paper_mode} interval={poll_interval}s')

    if not paper_mode and HAS_MT5:
        if not mt5.initialize():
            log.error('MT5 initialise() failed — falling back to paper mode')
            paper_mode = True
        else:
            log.info('MT5 connected')
    elif not paper_mode and not HAS_MT5:
        log.error('MetaTrader5 package not installed — falling back to paper mode')
        paper_mode = True

    while True:
        loop_start = time.time()
        status: dict = {
            'loop_at': datetime.now(timezone.utc).isoformat(),
            'paper':   paper_mode,
            'pairs_evaluated': [],
            'errors':  [],
        }

        try:
            # ── 1. Fetch state (config + snapshot) ─────────────────────────
            state  = fetch_state()
            config = state.get('bot_config') or {}

            # ── 2. Kill switch ─────────────────────────────────────────────
            if config.get('kill_switch', False):
                log.warning('KILL SWITCH ACTIVE — skipping evaluation')
                status['kill_switch'] = True
                push_bot_status(status)
                if run_once:
                    break
                time.sleep(poll_interval)
                continue

            # ── 3. Trade window ────────────────────────────────────────────
            if not within_trade_window(config):
                s = config.get('safety') or {}
                log.info(f'Outside window {s.get("trade_window_start")}–{s.get("trade_window_end")} UTC — sleeping')
                push_bot_status(status)
                if run_once:
                    break
                time.sleep(poll_interval)
                continue

            # ── 4. Staleness gate ──────────────────────────────────────────
            snap = state.get('regime_snapshot') or {}
            try:
                age_s = check_staleness(snap)
                log.info(f'Dashboard data age: {age_s / 60:.1f} min — OK')
            except StaleDataError as exc:
                log.warning(f'STALE: {exc}')
                status['errors'].append(str(exc))
                push_bot_status(status)
                if run_once:
                    break
                time.sleep(poll_interval)
                continue

            # ── 5. Evaluate pairs ──────────────────────────────────────────
            enabled_pairs   = config.get('enabled_pairs') or []
            comp_threshold  = (config.get('execution') or {}).get('composite_threshold', 0.60)
            min_agree       = (config.get('execution') or {}).get('min_agree', 3)
            max_trades      = (config.get('execution') or {}).get('max_trades', 2)
            trades_this_loop = 0
            sl_tp_engine    = SLTPEngine(config)

            for pair in enabled_pairs:
                if trades_this_loop >= max_trades:
                    log.info(f'Max trades ({max_trades}) reached — skipping remaining pairs')
                    break

                log.info(f'--- {pair} ---')
                pair_status: dict = {'pair': pair, 'action': 'skip', 'reason': ''}

                results, ctx = run_modules(state, pair, config)
                handle_actions(results, paper_mode)

                if ctx is None:
                    pair_status['reason'] = 'hard block'
                    status['pairs_evaluated'].append(pair_status)
                    continue

                direction, comp_score, comp_reason = composite_decision(results)
                log.info(f'  [{pair}] Composite: {comp_reason}')

                if direction is None or comp_score < comp_threshold:
                    pair_status['reason'] = comp_reason
                    status['pairs_evaluated'].append(pair_status)
                    continue

                # Directional agreement check
                passing_dir = sum(
                    1 for v in results.values()
                    if v and v.passed and v.signal == direction
                )
                if passing_dir < min_agree:
                    pair_status['reason'] = f'Only {passing_dir}/{min_agree} modules agree on {direction}'
                    log.info(f'  [{pair}] Insufficient agreement: {pair_status["reason"]}')
                    status['pairs_evaluated'].append(pair_status)
                    continue

                # Extract entry from confluence
                conf_result = results.get('confluence')
                if not conf_result or not conf_result.metadata.get('entry'):
                    pair_status['reason'] = 'No entry from confluence module'
                    status['pairs_evaluated'].append(pair_status)
                    continue

                entry       = conf_result.metadata['entry']
                pair_snap   = (snap.get('pairs') or {}).get(pair) or {}
                entry_price = float(entry.get('price') or 0)

                # SL/TP
                sl_tp = sl_tp_engine.calculate(
                    entry=entry, pair=pair, pair_data=pair_snap,
                    direction=direction.lower(), price=entry_price,
                )

                # Position size
                vol_mult = (results.get('vol_gate') or type('', (), {'metadata': {}})()).metadata.get('size_mult', 1.0)
                risk_pct = (config.get('position') or {}).get('risk_pct', 1.0) * vol_mult

                if HAS_MT5 and not paper_mode:
                    acct    = mt5.account_info()
                    balance = acct.balance if acct else 10_000
                else:
                    balance = 10_000  # paper dummy

                sl_dist = abs(entry_price - sl_tp.sl)
                size    = sl_tp_engine.position_size(balance, risk_pct, sl_dist, pair, 1.0)

                log.info(
                    f'  [{pair}] ENTRY {direction} {entry.get("totalStars", 0)}★ '
                    f'@ {entry_price} | SL={sl_tp.sl} TP={sl_tp.tp} R:R={sl_tp.rr_ratio} '
                    f'| lot={size} score={comp_score:.2f}'
                )

                ok = execute_trade(pair, direction, entry, sl_tp, size, paper_mode)
                if ok:
                    trades_this_loop += 1

                pair_status.update({
                    'action': 'trade', 'direction': direction,
                    'score': round(comp_score, 2),
                    'stars': entry.get('totalStars'),
                    'entry': entry_price,
                    'sl': sl_tp.sl, 'tp': sl_tp.tp, 'rr': sl_tp.rr_ratio,
                    'lot': size, 'executed': ok,
                })
                status['pairs_evaluated'].append(pair_status)

        except Exception as exc:
            log.error(f'Loop error: {exc}', exc_info=True)
            status['errors'].append(str(exc))

        push_bot_status(status)
        elapsed = time.time() - loop_start
        log.info(f'Loop done in {elapsed:.1f}s')

        if run_once:
            break

        sleep_s = max(0, poll_interval - elapsed)
        log.info(f'Sleeping {sleep_s:.0f}s')
        time.sleep(sleep_s)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='MacroFX Trading Bot')
    ap.add_argument('--live',     action='store_true', help='Send real orders to MT5 (default: paper mode)')
    ap.add_argument('--paper',    action='store_true', help='Paper mode — log signals only (default)')
    ap.add_argument('--once',     action='store_true', help='Run one evaluation loop then exit')
    ap.add_argument('--interval', type=int, default=120, help='Poll interval in seconds (default: 120)')
    args = ap.parse_args()

    # Safe default: paper unless --live is explicitly passed
    paper = not args.live or args.paper

    main_loop(paper_mode=paper, poll_interval=args.interval, run_once=args.once)
