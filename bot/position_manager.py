"""
Position manager — runs every price tick after the pre-screen phase.

For each open MacroFX position (magic=20260001), checks:
  1. Has price crossed tp1?  → partial close + SL to breakeven
  2. Is trailing active?     → update SL when price moves favorably

position_meta is a dict keyed by ticket (int) with structure:
    {
        'tp1':              float,        # first partial target price
        'tp1_close_pct':    float,        # % of lot to close at tp1 (e.g. 50)
        'trailoffset_dist': float,        # trailing SL distance in price units
        'tp1_hit':          bool,         # has tp1 partial been executed?
        'trail_active':     bool,         # is trail active?
        'trail_sl':         float | None, # current trail SL price
    }

The dict is mutated in-place. Keys for closed positions are removed.
Returns list of action-log dicts for the status report.
"""

import logging
from typing import Optional

log = logging.getLogger(__name__)

MAGIC = 20260001

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False


def _send(req: dict) -> bool:
    """Sends an MT5 order and returns True on success."""
    res = mt5.order_send(req)
    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
        code = getattr(res, 'retcode', '?')
        comment = getattr(res, 'comment', '')
        log.error(f'MT5 order failed: retcode={code}  {comment}')
        return False
    return True


def manage_positions(position_meta: dict, paper_mode: bool) -> list[dict]:
    """
    Scans all open MT5 positions with magic=MAGIC.
    Applies TP1 partial close, breakeven move, and trailing stop.

    Args:
        position_meta: mutable dict of per-ticket management state
        paper_mode:    if True, skip all MT5 calls and return []

    Returns:
        List of action dicts (for logging / status push).
    """
    if paper_mode or not HAS_MT5:
        return []

    actions: list[dict] = []

    try:
        positions = mt5.positions_get() or []
    except Exception as exc:
        log.warning(f'manage_positions: positions_get() failed: {exc}')
        return []

    open_tickets = {p.ticket for p in positions}

    # Prune meta for positions that are no longer open
    for ticket in list(position_meta.keys()):
        if ticket not in open_tickets:
            log.info(f'Position {ticket} closed — removing from meta')
            del position_meta[ticket]

    for pos in positions:
        if pos.magic != MAGIC:
            continue

        meta = position_meta.get(pos.ticket)
        if not meta:
            # Bootstrap meta for orphaned positions (e.g. bot restarted after entry).
            # Derive trail offset from existing SL distance so trailing resumes.
            if pos.sl and pos.sl != 0.0:
                offset = abs(pos.price_open - float(pos.sl))
                log.warning(
                    f'Position {pos.ticket} ({pos.symbol}) has no meta — bootstrapping trail '
                    f'from existing SL distance ({offset:.5f})'
                )
                meta = {
                    'tp1':              None,
                    'tp1_close_pct':    50,
                    'trailoffset_dist': offset,
                    'tp1_hit':          True,
                    'trail_active':     True,
                    'trail_sl':         float(pos.sl),
                }
                position_meta[pos.ticket] = meta
            else:
                log.warning(
                    f'Position {pos.ticket} ({pos.symbol}) has no meta and no SL — '
                    f'cannot bootstrap trail; set an SL manually'
                )
                continue

        try:
            tick = mt5.symbol_info_tick(pos.symbol)
        except Exception:
            continue
        if not tick:
            continue

        is_long       = pos.type == mt5.ORDER_TYPE_BUY
        current_price = tick.bid if is_long else tick.ask

        # ── TP1 partial close ──────────────────────────────────────────────────
        if not meta.get('tp1_hit') and meta.get('tp1'):
            tp1         = float(meta['tp1'])
            tp1_reached = current_price >= tp1 if is_long else current_price <= tp1

            if tp1_reached:
                close_pct = (meta.get('tp1_close_pct') or 50) / 100
                close_vol = max(0.01, round(pos.volume * close_pct, 2))

                # Only partial close if we'd have something left
                if close_vol < pos.volume:
                    close_type  = mt5.ORDER_TYPE_SELL if is_long else mt5.ORDER_TYPE_BUY
                    close_price = tick.bid if is_long else tick.ask
                    ok = _send({
                        'action':       mt5.TRADE_ACTION_DEAL,
                        'symbol':       pos.symbol,
                        'volume':       close_vol,
                        'type':         close_type,
                        'position':     pos.ticket,
                        'price':        close_price,
                        'deviation':    20,
                        'magic':        MAGIC,
                        'comment':      'MacroFX TP1',
                        'type_time':    mt5.ORDER_TIME_GTC,
                        'type_filling': mt5.ORDER_FILLING_IOC,
                    })
                    if ok:
                        log.info(
                            f'TP1 partial close: ticket={pos.ticket}  '
                            f'vol={close_vol}  price={close_price:.5f}'
                        )
                        meta['tp1_hit'] = True
                        actions.append({
                            'action': 'tp1_partial', 'ticket': pos.ticket,
                            'vol': close_vol, 'price': close_price,
                        })

                        # Move SL to breakeven immediately after TP1
                        be = pos.price_open
                        sl_needs_move = (is_long and (not pos.sl or pos.sl < be)) or \
                                        (not is_long and (not pos.sl or pos.sl > be))
                        if sl_needs_move:
                            ok_be = _send({
                                'action':   mt5.TRADE_ACTION_SLTP,
                                'position': pos.ticket,
                                'sl':       round(be, 5),
                                'tp':       pos.tp,
                            })
                            if ok_be:
                                log.info(f'SL → breakeven: ticket={pos.ticket}  BE={be:.5f}')
                                actions.append({'action': 'sl_to_be', 'ticket': pos.ticket, 'sl': be})

                        meta['trail_active'] = True
                else:
                    log.warning(
                        f'TP1 close volume ({close_vol}) >= position volume ({pos.volume}) '
                        f'— would fully close, skipping partial'
                    )
                    # Still activate trail so we manage the remaining position
                    meta['tp1_hit'] = True
                    meta['trail_active'] = True

        # ── Trailing stop ──────────────────────────────────────────────────────
        if meta.get('trail_active') and meta.get('trailoffset_dist'):
            offset  = float(meta['trailoffset_dist'])
            new_sl  = round(current_price - offset, 5) if is_long else round(current_price + offset, 5)
            trail_sl = meta.get('trail_sl')

            # Initialise trail_sl from current SL if not set
            if trail_sl is None:
                trail_sl = pos.sl or (pos.price_open - offset * 2 if is_long else pos.price_open + offset * 2)
                meta['trail_sl'] = trail_sl

            should_move = (is_long and new_sl > trail_sl) or (not is_long and new_sl < trail_sl)

            # Never move SL to loss side
            safe = (is_long and new_sl >= pos.price_open) or (not is_long and new_sl <= pos.price_open)

            if should_move and safe:
                ok = _send({
                    'action':   mt5.TRADE_ACTION_SLTP,
                    'position': pos.ticket,
                    'sl':       new_sl,
                    'tp':       pos.tp,
                })
                if ok:
                    log.debug(f'Trail SL: ticket={pos.ticket}  sl={new_sl:.5f}  (was {trail_sl:.5f})')
                    meta['trail_sl'] = new_sl
                    actions.append({'action': 'trail_sl', 'ticket': pos.ticket, 'sl': new_sl})

    return actions
