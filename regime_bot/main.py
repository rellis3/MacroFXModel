"""
RegimeBot — 1-minute HMM regime-following trading bot (v2).

Every SCAN_INTERVAL seconds (default 60s):
  1. Refresh dashboard context if due (trained params, FRED macro, COT, OI)
  2. Fetch the last 300 1m bars from MT5
  3. Run the v2 4-state HMM → regime + macro-adjusted confidence
  4. Update the rolling decay window → compute decay score
  5. Update the risk manager with current balance
  6. Check exit conditions (if holding a position)
  7. Check risk gates + OI wall + entry conditions (if flat)
  8. On entry: ATR-based SL/TP → account %-risk lot size
              adjusted by macro_mult × COT_mult × decay_discount → place order

Telegram handles /status /pause /resume /exit /config concurrently.

Usage:
  python main.py            # paper mode — no real orders
  python main.py --live     # live MT5 orders (requires MT5 + .env filled in)
  python main.py --once     # single tick then exit (testing)
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import config
import mt5_client
from regime_engine    import RegimeEngine
from decay_detector   import DecayDetector
from risk_manager     import RiskManager
from state_machine    import BotState, should_enter, should_exit, on_entry, on_exit
from telegram_bot     import TelegramBot
from dashboard_client import DashboardClient


# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-5s  %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('regime_bot.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)


# ── Singleton state ────────────────────────────────────────────────────────────

_engine  = RegimeEngine()
_decay   = DecayDetector()
_risk    = RiskManager()
_state   = BotState()
_ctx     = DashboardClient()


# ── Status / config text (Telegram commands) ───────────────────────────────────

def _status_text() -> str:
    snap = _state.last_snap
    if snap is None:
        return 'RegimeBot: warming up — no regime data yet'

    d      = _state.last_decay
    r_icon = '🟢' if snap.regime == 'BULL' else ('🔴' if snap.regime == 'BEAR' else '🟡')
    d_icon = '🔴' if d >= config.DECAY_EXIT else ('🟠' if d >= config.DECAY_WARNING else '🟢')
    mode   = '⏸ PAUSED' if _state.paused else '▶️ ACTIVE'

    balance = mt5_client.get_account_balance()
    dd      = _risk.dd_status(balance)

    macro_line = (
        f'Macro: {snap.macro_label}  mult={snap.macro_mult:.2f}  '
        f'{"learned" if snap.is_learned else "defaults"}  sess={snap.session}'
    )

    lines = [
        f'<b>RegimeBot</b> — {config.PAIR}',
        (f'{r_icon} <b>{snap.regime}</b>  conf={snap.conf*100:.1f}%'
         f'  raw={snap.raw_conf*100:.1f}%  rl={snap.run_length}b'
         f'  vol_z={snap.vol_z:+.2f}  adx_z={snap.adx_z:+.2f}'),
        f'{d_icon} Decay: <b>{d:.3f}</b>  (warn≥{config.DECAY_WARNING}  exit≥{config.DECAY_EXIT})',
        macro_line,
        _ctx.cot_summary(),
        _ctx.oi_summary(),
        f'Phase: {_state.phase}  |  {mode}  |  {"🔴 LIVE" if config.LIVE_MODE else "PAPER"}',
        (f'DD: day={dd["day_dd_pct"]:+.2f}%  session={dd["session_dd_pct"]:+.2f}%  '
         f'trades={dd["daily_trades"]}/{dd["max_daily"]}'
         + ('  🔒 LOCKED' if dd['locked'] else '')),
    ]

    if _state.phase != 'FLAT':
        pos = mt5_client.get_open_position()
        pnl = f'{pos["pnl_pct"]:+.3f}%  (${pos["profit"]:.2f})' if pos else 'unknown'
        held = ''
        if _state.entry_time:
            delta = datetime.now(timezone.utc) - _state.entry_time
            held  = f'  held {int(delta.total_seconds() // 60)}m'
        lines.append(
            f'📈 Ticket {_state.ticket}  lots={_state.entry_lots}  P&L={pnl}{held}'
        )
    else:
        lines.append('No open position')

    return '\n'.join(lines)


def _config_text() -> str:
    sl_desc = (
        f'ATR({config.SL_ATR_BARS})×{config.SL_ATR_MULT}  max={config.SL_MAX_PIPS}p'
        if config.SL_METHOD == 'atr'
        else f'fixed {config.SL_FIXED_PIPS}p'
    )
    return (
        f'<b>RegimeBot config</b> — {config.PAIR}\n'
        f'Dashboard: {config.DASHBOARD_URL}  refresh={config.CONTEXT_REFRESH_MIN}m\n'
        f'Entry: conf≥{config.ENTRY_CONF_MIN*100:.0f}%  (+{config.THIN_CONF_BOOST*100:.0f}% thin)  '
        f'vol_z≤{config.ENTRY_VOL_Z_MAX}  decay≤{config.ENTRY_DECAY_MAX}\n'
        f'Decay exit: ≥{config.DECAY_EXIT}  warning: ≥{config.DECAY_WARNING}  flip_exit={config.REGIME_FLIP_EXIT}\n'
        f'SL: {sl_desc}  |  TP: {config.TP_RR}R  max={config.TP_MAX_PIPS}p\n'
        f'Size: {config.RISK_PCT_PER_TRADE}% risk/trade  lots={config.LOT_SIZE_MIN}–{config.LOT_SIZE_MAX}\n'
        f'COT mults: aligned={config.COT_ALIGNED_MULT}  neutral={config.COT_NEUTRAL_MULT}  opposed={config.COT_OPPOSED_MULT}\n'
        f'OI wall block: within {config.OI_WALL_PIPS}p\n'
        f'DD limits: daily={config.MAX_DAILY_DD_PCT}%  session={config.MAX_SESSION_DD_PCT}%  lockout={config.DD_LOCKOUT_HOURS}h\n'
        f'Trades: max={config.MAX_DAILY_TRADES}/day  cooldown={config.TRADE_COOLDOWN_MIN}m\n'
        f'Scan: {config.SCAN_INTERVAL_S}s  magic={config.MAGIC}  mode={"LIVE" if config.LIVE_MODE else "PAPER"}'
    )


# ── Telegram command callbacks ─────────────────────────────────────────────────

def _cmd_pause() -> None:
    _state.paused = True
    log.info('Bot paused via Telegram')


def _cmd_resume() -> None:
    _state.paused = False
    log.info('Bot resumed via Telegram')


def _cmd_force_exit(tg: TelegramBot) -> None:
    if _state.phase == 'FLAT':
        tg.send('No open position to close.')
        return
    log.info(f'Force exit: closing ticket={_state.ticket}')
    ok = mt5_client.close_position(_state.ticket)
    if ok:
        on_exit(_state)
        tg.send('🔴 <b>Force exit complete</b> — position closed')
    else:
        tg.send('⚠️ Force exit <b>FAILED</b> — check MT5 manually')


# ── Main tick ──────────────────────────────────────────────────────────────────

def tick(tg: TelegramBot) -> None:
    # 1. Refresh dashboard context (rate-limited to CONTEXT_REFRESH_MIN)
    _ctx.refresh_if_due()

    # 2. Fetch 1m bars
    bars = mt5_client.fetch_bars_1m(config.PAIR, count=config.HMM_BARS)
    if bars is None:
        log.warning('No 1m bar data — MT5 unavailable or warming up')
        return

    # 3. Compute HMM regime snapshot with learned params + macro context
    snap = _engine.update(bars, _ctx.trained_params, _ctx.macro_ctx)
    if snap is None:
        log.info(f'HMM warming up — need ≥{config.HMM_LINREG_N + 50} bars')
        return

    _state.last_snap = snap

    # 4. Decay score
    _decay.push(snap)
    d             = _decay.score()
    _state.last_decay = d
    dsummary      = _decay.summary()

    # 5. Balance + risk tracking
    balance = mt5_client.get_account_balance()
    _risk.update_balance(balance)

    # 6. Status log line
    dd = _risk.dd_status(balance)
    log.info(
        f'● {snap.regime:<5s}  conf={snap.conf*100:.1f}%  raw={snap.raw_conf*100:.1f}%  '
        f'macro={snap.macro_label}({snap.macro_mult:.2f})  rl={snap.run_length}b  '
        f'vol_z={snap.vol_z:+.2f}  adx_z={snap.adx_z:+.2f}  decay={d:.3f}  '
        f'sess={snap.session}  phase={_state.phase}  '
        f'dd_day={dd["day_dd_pct"]:+.2f}%  trades={dd["daily_trades"]}/{dd["max_daily"]}'
    )

    # 7. Check exit if holding
    if _state.phase != 'FLAT':
        reason = should_exit(snap, d, _state)

        if d >= config.DECAY_WARNING and d < config.DECAY_EXIT:
            log.warning(f'Decay WARNING: {d:.3f}  {dsummary}')
            tg.send(
                f'⚠️ <b>Decay warning</b> {config.PAIR}\n'
                f'Score: {d:.3f}  (exit at ≥{config.DECAY_EXIT})\n'
                f'Regime: {snap.regime}  conf={snap.conf*100:.1f}%\n'
                f'Macro: {snap.macro_label}  {str(dsummary)}'
            )

        if reason:
            log.info(f'EXIT triggered: {reason}')
            pos_before = mt5_client.get_open_position()
            ok         = mt5_client.close_position(_state.ticket)
            if ok:
                pnl_str = ''
                if pos_before:
                    pnl_str = f'\nP&L: {pos_before["pnl_pct"]:+.3f}%  (${pos_before["profit"]:.2f})'
                on_exit(_state)
                tg.send(
                    f'🔴 <b>EXIT</b> {config.PAIR}\n'
                    f'Reason: {reason}{pnl_str}\n'
                    f'Regime: {snap.regime}  conf={snap.conf*100:.1f}%  decay={d:.3f}'
                )
            else:
                log.error('close_position failed — will retry next tick')
            return

    # 8. Check entry if flat
    if _state.phase == 'FLAT':
        direction = should_enter(snap, d, _state)
        if not direction:
            return

        # Risk gates (DD / cooldown / daily cap)
        allowed, block_reason = _risk.check_entry(balance)
        if not allowed:
            log.info(f'Entry blocked by risk manager: {block_reason}')
            return

        # Get current price for SL/TP anchoring
        tick_data = mt5_client.get_tick(config.PAIR)
        if tick_data:
            bid, ask = tick_data
            price    = ask if direction == 'BUY' else bid
        else:
            price    = 0.0  # paper mode

        # Compute ATR-based SL/TP
        sl, tp, sl_pips, sl_method = _risk.compute_sl_tp(bars, direction, price)

        # OI wall hard-block — reject if entry is too close to a large options wall
        oi_blocked, oi_reason = _ctx.oi_wall_block(direction, price, sl_pips)
        if oi_blocked:
            log.info(f'Entry blocked by OI wall: {oi_reason}')
            return

        # COT lot-size multiplier based on CFTC leveraged-fund positioning
        cot_mult = _ctx.cot_direction_mult(direction)

        # Account %-risk lot size, adjusted by macro, COT, and decay
        lots = _risk.size_lots(
            balance,
            sl_pips,
            decay_score=d,
            macro_mult=snap.macro_mult,
            cot_mult=cot_mult,
        )

        log.info(
            f'ENTRY {direction}  lots={lots}  SL={sl_pips:.1f}p [{sl_method}]  '
            f'TP={config.TP_RR}R  risk={config.RISK_PCT_PER_TRADE}%  '
            f'macro_mult={snap.macro_mult:.2f}  cot_mult={cot_mult:.2f}  '
            f'decay_disc={1.0 - d * 0.5:.2f}'
        )

        fill = mt5_client.place_order(direction, lots, sl, tp)
        if fill:
            on_entry(_state, direction, snap, d, fill)
            _risk.record_trade()
            icon = '🟢' if direction == 'BUY' else '🔴'
            tg.send(
                f'{icon} <b>ENTRY {direction}</b> {config.PAIR}\n'
                f'Regime: {snap.regime}  conf={snap.conf*100:.1f}%  rl={snap.run_length}b\n'
                f'vol_z={snap.vol_z:+.2f}  decay={d:.3f}  sess={snap.session}\n'
                f'Macro: {snap.macro_label} (×{snap.macro_mult:.2f})  '
                f'COT ×{cot_mult:.2f}  {"learned" if snap.is_learned else "defaults"}\n'
                f'Lots: {fill["lots"]}  @ {fill["price"]}\n'
                f'SL: {fill["sl"]} ({sl_pips:.1f}p via {sl_method})\n'
                f'TP: {fill["tp"]} ({config.TP_RR}R)\n'
                f'Risk: {config.RISK_PCT_PER_TRADE}% of ${balance:.0f}\n'
                f'{"🔴 LIVE" if config.LIVE_MODE else "PAPER"}'
            )


# ── Boot ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description='RegimeBot — 1m HMM regime trader v2')
    parser.add_argument('--live', action='store_true',
                        help='Enable live MT5 orders (overrides RB_LIVE_MODE)')
    parser.add_argument('--once', action='store_true',
                        help='Run a single tick then exit (testing)')
    args = parser.parse_args()

    if args.live:
        os.environ['RB_LIVE_MODE'] = 'true'
        import importlib
        importlib.reload(config)

    log.info(
        f'RegimeBot v2 starting  pair={config.PAIR}  '
        f'mode={"LIVE" if config.LIVE_MODE else "PAPER"}  '
        f'interval={config.SCAN_INTERVAL_S}s  '
        f'SL={config.SL_METHOD}  risk={config.RISK_PCT_PER_TRADE}%/trade'
    )

    connected = mt5_client.connect()
    if not connected:
        log.warning('MT5 not available — paper mode active')

    # Initial dashboard context fetch (macro, trained params, COT, OI)
    log.info(f'Fetching dashboard context from {config.DASHBOARD_URL}…')
    _ctx.refresh()

    tg = TelegramBot(get_status_fn=_status_text, get_config_fn=_config_text)
    tg.set_callbacks(
        pause=_cmd_pause,
        resume=_cmd_resume,
        force_exit=lambda: _cmd_force_exit(tg),
    )
    tg.start_polling()

    tg.send(
        f'🤖 <b>RegimeBot v2 started</b>\n'
        f'Pair: {config.PAIR}  |  Mode: {"🔴 LIVE" if config.LIVE_MODE else "PAPER"}\n'
        f'Macro: {_ctx.macro_label} (×{_ctx.macro_mult:.2f})\n'
        f'Params: {"learned ✅" if _ctx.trained_params else "defaults"}\n'
        f'{_ctx.cot_summary()}\n'
        f'{_ctx.oi_summary()}\n'
        f'Entry: conf≥{config.ENTRY_CONF_MIN*100:.0f}%  decay≤{config.ENTRY_DECAY_MAX}\n'
        f'Exit: decay≥{config.DECAY_EXIT}  flip={config.REGIME_FLIP_EXIT}\n'
        f'SL: {config.SL_METHOD.upper()}×{config.SL_ATR_MULT}  TP: {config.TP_RR}R\n'
        f'Risk: {config.RISK_PCT_PER_TRADE}%/trade  DD limit: {config.MAX_DAILY_DD_PCT}%/day'
    )

    try:
        while True:
            try:
                tick(tg)
            except Exception as exc:
                log.error(f'Tick error: {exc}', exc_info=True)
                tg.send(f'⚠️ <b>Tick error</b>\n{exc}')

            if args.once:
                log.info('--once: single tick complete')
                break

            time.sleep(config.SCAN_INTERVAL_S)

    except KeyboardInterrupt:
        log.info('Shutdown requested (KeyboardInterrupt)')
    finally:
        mt5_client.shutdown()
        tg.send(f'🔴 <b>RegimeBot stopped</b>  phase={_state.phase}')
        log.info('RegimeBot stopped')


if __name__ == '__main__':
    main()
