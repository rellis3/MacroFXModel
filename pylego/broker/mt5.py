"""Mt5Broker — the shared MetaTrader5 execution brick.

Consolidates the MT5 plumbing copied across bot/main.py, regime_bot, RegimeV2/V7
and DynAnchorBot: connect/login/account-check, live price/ATR/balance, the
position serialisers the dashboard renders, and order entry/exit. Lifted from
bot/regime_bot.py with the module globals (`mt5`, `HAS_MT5`, `log`, `MAGIC`,
`_mt5_sym`, `_PIP_SIZES`) turned into injected dependencies so one brick serves
every bot and can be tested offline against a fake MT5 module.

Construction:
    broker = Mt5Broker(
        magic=20260002,
        symbol_resolver=_mt5_sym,                       # pair -> broker MT5 symbol
        pip_resolver=lambda p: _PIP_SIZES.get(p, 0.0001),
        log=log,                                        # optional
        mt5_module=None,                                # default: import MetaTrader5
    )

The serialisers (`serialize_open_positions` / `serialize_closed_trades`) emit the
EXACT field set the dashboard positions tab reads — see PYTHON_LEGO.md §7. Don't
change those keys without updating the dashboard.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Callable

from pylego.broker.clock import ServerClock, closes_on_utc_day, history_window


class Mt5Broker:
    def __init__(
        self,
        magic: int,
        symbol_resolver: Callable[[str], str],
        pip_resolver: Callable[[str], float],
        log: logging.Logger | None = None,
        mt5_module=None,
        deviation: int = 20,
    ):
        self.magic = magic
        self.resolve = symbol_resolver          # pair -> MT5 symbol (broker-specific)
        self.pip = pip_resolver                 # pair -> pip size
        self.log = log or logging.getLogger("pylego.broker.mt5")
        self.deviation = deviation
        self._exc_cache: dict[int, tuple] = {}  # position_id -> (mfe_pips, mae_pips)
        # Short machine-readable reason for the LAST enter() call that returned
        # None/-1 -- enter()'s return type (int|None) is a shared contract every
        # other bot already depends on, so this is a side-channel attribute
        # instead of changing the signature. Set at the top of every enter()
        # call (cleared) and again at whichever failure branch fires; read it
        # immediately after a failed enter() call, before the next one runs.
        self.last_reject_reason: str | None = None

        if mt5_module is not None:
            self.mt5 = mt5_module
            self.available = True
        else:
            try:
                import MetaTrader5 as _mt5  # type: ignore
                self.mt5 = _mt5
                self.available = True
            except ImportError:
                self.mt5 = None
                self.available = False

        # MT5 stamps every `.time` field on the BROKER's wall clock, not UTC.
        # The serialisers publish this offset per row (`tz_offset_sec`) so a
        # reader can tell a broker-clock stamp from a true-UTC one instead of
        # guessing — see pylego/broker/clock.py.
        self.clock = ServerClock(self.mt5, log=self.log)

    # ── Connection ──────────────────────────────────────────────────────────
    def connect(self, account: str, password: str, server: str, path: str | None = None) -> bool:
        """initialize + login + account-match safety check. Returns True on a
        verified connection. Mirrors regime_bot.mt5_connect()."""
        if not self.available:
            self.log.warning('MetaTrader5 not installed — paper mode only')
            return False

        mt5 = self.mt5
        ok = mt5.initialize(path=path) if path else mt5.initialize()
        if not ok:
            self.log.error(f'MT5 initialize() failed: {mt5.last_error()}')
            return False

        if account and password and server:
            try:
                if not mt5.login(int(account), password, server):
                    self.log.error(f'MT5 login() failed: {mt5.last_error()}')
                    return False
            except Exception as exc:
                self.log.error(f'MT5 login() raised: {exc}')
                return False

        info = mt5.account_info()
        if info:
            self.log.info(
                f'MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}'
                f'  server={info.server}  leverage=1:{info.leverage}'
            )
            # Abort if the connected account isn't the expected one — prevents
            # trading the wrong account when creds are missing and MT5 falls back
            # to its active session.
            if account and str(info.login) != str(account):
                self.log.error(
                    f'MT5 account mismatch: expected {account} but connected to {info.login} '
                    f'— refusing to start.'
                )
                mt5.shutdown()
                return False
        # Measure (and log) the broker's clock offset once the session is up, so
        # a wrong time base is visible at startup rather than in a trade chart.
        self.clock.offset_sec(force=True)
        return True

    def server_offset_sec(self) -> int | None:
        """Seconds the broker's wall clock runs AHEAD of UTC — the amount every
        `time_open` / `time_close` this brick emits is shifted by. None when it
        can't be measured (market closed on a cold start); never assume 0."""
        return self.clock.offset_sec()

    def shutdown(self) -> None:
        if self.available and self.mt5:
            self.mt5.shutdown()

    # ── Market data ─────────────────────────────────────────────────────────
    def price(self, pair: str) -> float | None:
        """MT5 mid price (bid+ask)/2, or None. Dashboard-API fallback stays in
        the bot — this brick is MT5-only."""
        if not self.available:
            return None
        try:
            tick = self.mt5.symbol_info_tick(self.resolve(pair))
            if tick and tick.bid > 0:
                return round((tick.bid + tick.ask) / 2, 6)
        except Exception:
            pass
        return None

    def atr(self, pair: str, tf: str = '5m', period: int = 30, alpha: float = 0.15) -> float | None:
        """EMA-ATR from MT5 bars (alpha=0.15, matches dashboard vol.js)."""
        if not self.available:
            return None
        try:
            mt5 = self.mt5
            timeframe = mt5.TIMEFRAME_M5 if tf == '5m' else mt5.TIMEFRAME_M30
            bars = mt5.copy_rates_from_pos(self.resolve(pair), timeframe, 0, period)
            if bars is None or len(bars) < 2:
                return None
            atr = abs(float(bars[1]['high']) - float(bars[1]['low']))
            for i in range(1, len(bars)):
                h = float(bars[i]['high'])
                l = float(bars[i]['low'])
                pc = float(bars[i - 1]['close'])
                tr = max(h - l, abs(h - pc), abs(l - pc))
                atr = alpha * tr + (1 - alpha) * atr
            return round(atr, 6)
        except Exception:
            return None

    def session_bars(self, pair: str, since_epoch: int, tf=None) -> list:
        """M1 OHLC bars from `since_epoch` (UTC seconds) to now — for a bot's
        session catch-up (reconstruct running extremes + velocity buffer without
        seeding). Returns [{open, high, low, close, time}] (empty if MT5 absent).
        The FIRST bar's open is the true live session open the bot anchors the OC
        lines on (the plan's D1 open is stale when refreshed mid-session)."""
        if not self.available:
            return []
        try:
            mt5 = self.mt5
            timeframe = tf if tf is not None else mt5.TIMEFRAME_M1
            start = datetime.fromtimestamp(int(since_epoch), tz=timezone.utc)
            rates = mt5.copy_rates_range(self.resolve(pair), timeframe, start, datetime.now(timezone.utc))
            if rates is None:
                return []
            return [{'open': float(r['open']), 'high': float(r['high']), 'low': float(r['low']),
                     'close': float(r['close']), 'time': int(r['time'])} for r in rates]
        except Exception:
            return []

    def account_balance(self) -> float | None:
        """Live MT5 account balance, or None when unavailable. The paper-mode /
        default-balance policy stays in the bot."""
        if not self.available:
            return None
        info = self.mt5.account_info()
        return info.balance if info else None

    def _excursion_pips(self, pid, symbol, time_open, time_close, is_long, open_price):
        """Best-effort MFE/MAE (pips) for a CLOSED position, reconstructed from the
        M1 high/low path between open and close (MT5 deal history has no
        excursion). Cached by position_id, computed once. Returns
        ``(mfe_pips, mae_pips)`` — MFE>=0, MAE<=0 — or ``(None, None)`` on ANY
        failure. NEVER raises: serialize_closed_trades feeds the dashboard AND
        the server rollup, and a throw there would blank the whole payload."""
        if pid in self._exc_cache:
            return self._exc_cache[pid]
        res = (None, None)
        try:
            if self.available and time_open and open_price:
                mt5 = self.mt5
                frm = datetime.fromtimestamp(int(time_open), tz=timezone.utc)
                to = (datetime.fromtimestamp(int(time_close), tz=timezone.utc)
                      if time_close else datetime.now(timezone.utc))
                rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, frm, to)
                if rates is not None and len(rates):
                    info = mt5.symbol_info(symbol)
                    point = float(getattr(info, 'point', 0.0) or 0.0)
                    digits = int(getattr(info, 'digits', 0) or 0)
                    pip = point * (10 if digits in (3, 5) else 1) if point else None
                    if pip:
                        hi = max(float(r['high']) for r in rates)
                        lo = min(float(r['low']) for r in rates)
                        if is_long:
                            mfe, mae = (hi - open_price) / pip, (lo - open_price) / pip
                        else:
                            mfe, mae = (open_price - lo) / pip, (open_price - hi) / pip
                        res = (round(max(mfe, 0.0), 1), round(min(mae, 0.0), 1))
        except Exception:
            res = (None, None)
        if len(self._exc_cache) > 4000:         # unbounded-uptime backstop
            self._exc_cache.clear()
        self._exc_cache[pid] = res
        return res

    # ── Position serialisers (feed the dashboard positions tab — §7) ─────────
    def serialize_open_positions(self) -> list:
        """Live open positions for this bot's magic. Field set is part of the
        dashboard contract (PYTHON_LEGO.md §7)."""
        if not self.available:
            return []
        try:
            tz_off = self.server_offset_sec()
            return [
                {
                    'ticket':     int(p.ticket),
                    'symbol':     p.symbol,
                    'direction':  'BUY' if p.type == 0 else 'SELL',
                    'lots':       round(float(p.volume), 2),
                    'open_price': round(float(p.price_open), 5),
                    'price':      round(float(p.price_current), 5),
                    'profit':     round(float(p.profit), 2),
                    'swap':       round(float(p.swap), 2),
                    'time_open':  int(p.time),
                    # MT5 stamps `p.time` on the broker's clock, not UTC. Ship
                    # the offset with the row so the dashboard renders the right
                    # instant instead of assuming a base — pylego/broker/clock.py.
                    'tz_offset_sec': tz_off,
                    'comment':    str(p.comment or ''),
                }
                for p in (self.mt5.positions_get() or [])
                if p.magic == self.magic
            ]
        except Exception:
            return []

    def serialize_closed_trades(self) -> list:
        """Today's closed positions for this bot's magic, from MT5 deal history.

        Window vs bucket — two clocks that disagree. `history_deals_get` reads
        its date arguments on the BROKER's clock, while the dashboard files what
        we push under the server's real-UTC date, so a plain UTC-midnight window
        drops every trade closing in a UTC day's last `offset` hours. Ask wide,
        then keep only the closes that land on today's real UTC date —
        `pylego/broker/clock.py`."""
        if not self.available:
            return []
        try:
            mt5 = self.mt5
            tz_off = self.server_offset_sec()
            win_from, win_to = history_window()
            deals = mt5.history_deals_get(win_from, win_to) or []
            by_pos: dict = {}
            for d in deals:
                if d.magic != self.magic:
                    continue
                pid = int(d.position_id)
                if pid not in by_pos:
                    by_pos[pid] = {'in': None, 'out': []}
                if d.entry == 0:
                    by_pos[pid]['in'] = d
                elif d.entry in (1, 3):
                    by_pos[pid]['out'].append(d)
            result = []
            for pid, grp in by_pos.items():
                outs = grp['out']
                if not outs:
                    continue
                last_out = max(outs, key=lambda d: d.time)
                # The wide window's price: it also returns yesterday's and
                # tomorrow's closes, so bucket on the close's REAL-UTC date.
                if not closes_on_utc_day(int(last_out.time), tz_off):
                    continue
                ind = grp['in']
                if ind is None:
                    # Entry deal isn't in today's window — the position was
                    # opened on an earlier day (swing hold) and just closed
                    # today. Look it up directly by position id (unbounded
                    # by date) so multi-day trades still get an
                    # open_price/time_open.
                    try:
                        pos_deals = mt5.history_deals_get(position=pid) or []
                        ind = next((d for d in pos_deals if d.entry == 0), None)
                    except Exception:
                        ind = None
                if ind:
                    direction = 'BUY' if ind.type == 0 else 'SELL'
                    open_price = round(float(ind.price), 5)
                    time_open = int(ind.time)
                else:
                    direction = 'BUY' if last_out.type == 1 else 'SELL'
                    open_price = None
                    time_open = None
                mfe_pips, mae_pips = self._excursion_pips(
                    pid, last_out.symbol, time_open, int(last_out.time),
                    direction == 'BUY', open_price)
                result.append({
                    'position_id': pid,
                    'symbol':      last_out.symbol,
                    'direction':   direction,
                    'lots':        round(sum(d.volume for d in outs), 2),
                    'open_price':  open_price,
                    'close_price': round(float(last_out.price), 5),
                    'profit':      round(sum(d.profit for d in outs), 2),
                    'swap':        round(sum(d.swap for d in outs), 2),
                    'commission':  round(sum(d.commission for d in outs), 2),
                    'time_open':   time_open,
                    'time_close':  int(last_out.time),
                    # Broker-clock offset for the two stamps above (see
                    # serialize_open_positions / pylego/broker/clock.py).
                    'tz_offset_sec': tz_off,
                    'comment':     str(ind.comment if ind else last_out.comment or ''),
                    # MFE/MAE (pips) reconstructed from the M1 path — the give-back
                    # inputs the dashboard/analysis read without re-walking M1.
                    'mfe_pips':    mfe_pips,
                    'mae_pips':    mae_pips,
                })
            return sorted(result, key=lambda t: t['time_close'])
        except Exception:
            return []

    # ── Order execution ─────────────────────────────────────────────────────
    def filling_mode(self, mt5_sym: str) -> int:
        mt5 = self.mt5
        info = mt5.symbol_info(mt5_sym)
        filling = mt5.ORDER_FILLING_IOC
        if info:
            am = info.filling_mode
            if   am & 1: filling = mt5.ORDER_FILLING_FOK
            elif am & 2: filling = mt5.ORDER_FILLING_IOC
            elif am & 4: filling = mt5.ORDER_FILLING_RETURN
        return filling

    @staticmethod
    def _safe_comment(comment, fallback: str) -> str:
        """MT5 order-comment guard: strip to ASCII and cap at 31 chars (the
        MqlTradeRequest.comment limit). A non-ASCII or over-long comment is rejected
        with "Invalid comment argument". Any short ``[dedupe_tag]`` a caller embeds
        survives the cap."""
        raw = comment if comment is not None else fallback
        return raw.encode('ascii', 'ignore').decode('ascii').strip()[:31] or fallback

    @staticmethod
    def _norm_volume(info, lots: float) -> float:
        """Round a requested lot to the symbol's volume_step and clamp to
        [volume_min, volume_max] — MT5 rejects anything off that grid with
        "Invalid volume argument". Falls back to the raw lot if no symbol info."""
        if info is None:
            return float(lots)
        vmin = float(getattr(info, 'volume_min', 0.0) or 0.0)
        vmax = float(getattr(info, 'volume_max', 0.0) or 0.0)
        step = float(getattr(info, 'volume_step', 0.0) or 0.0)
        vol = float(lots)
        if step > 0:
            vol = round(round(vol / step) * step, 8)
        if vmin > 0 and vol < vmin:
            vol = vmin
        if vmax > 0 and vol > vmax:
            # largest step multiple ≤ vmax (so the clamp itself stays on the grid)
            vol = round((int(vmax / step) * step) if step > 0 else vmax, 8)
        return vol

    def enter(
        self,
        pair: str,
        direction: str,
        sl: float,
        tp: float,
        lots: float,
        max_spread_pips: float,
        paper_mode: bool,
        comment: str | None = None,
        dedupe_tag: str | None = None,
    ) -> int | None:
        """Open a position. Returns ticket on success, -1 for paper, None on
        failure (incl. spread/duplicate blocks). Mirrors regime_bot.open_position.

        By default the duplicate guard blocks on ANY open position for ``pair``
        with this bot's magic number (one position per pair — the historical
        behaviour every caller still gets). Pass ``dedupe_tag`` to narrow that to
        positions whose comment contains ``[{dedupe_tag}]`` instead, letting a
        caller hold several concurrent positions per pair as long as each comes
        from a distinct tag (e.g. range_line_bot's per source/side slot)."""
        pip = self.pip(pair)
        self.last_reject_reason = None
        self.log.info(
            f'TRADE {pair} {direction}  SL={sl:.5f}  TP={tp:.5f}  lot={lots}'
            + ('  [PAPER]' if paper_mode else '')
        )

        if paper_mode:
            return -1
        if not self.available:
            self.log.error('MetaTrader5 not installed — cannot place live order')
            self.last_reject_reason = 'mt5_not_installed'
            return None

        mt5 = self.mt5
        mt5_sym = self.resolve(pair)

        # Trade-mode guard. Index/commodity CFDs keep streaming quotes outside their
        # cash session but reject orders with retcode 10017 ("Trade disabled") — e.g.
        # uk100 fired every line at ~23:00 London. symbol_info_tick() therefore can't
        # catch it (a tick still exists); the symbol's trade_mode must be checked.
        # Skip cleanly (like SPREAD/DUPLICATE BLOCK) rather than send a doomed order.
        info = mt5.symbol_info(mt5_sym)
        mode = getattr(info, 'trade_mode', None) if info is not None else None
        FULL      = getattr(mt5, 'SYMBOL_TRADE_MODE_FULL', 4)
        LONGONLY  = getattr(mt5, 'SYMBOL_TRADE_MODE_LONGONLY', 1)
        SHORTONLY = getattr(mt5, 'SYMBOL_TRADE_MODE_SHORTONLY', 2)
        tradable = (mode == FULL
                    or (mode == LONGONLY and direction == 'LONG')
                    or (mode == SHORTONLY and direction == 'SHORT'))
        if mode is not None and not tradable:
            self.log.warning(
                f'TRADE DISABLED {pair}: trade_mode={mode} (market likely outside its '
                f'session) — skipping {direction}'
            )
            self.last_reject_reason = 'trade_disabled'
            return None

        tick = mt5.symbol_info_tick(mt5_sym)
        if not tick:
            self.log.error(f'No tick for {mt5_sym}')
            self.last_reject_reason = 'no_tick'
            return None

        spread_pips = (tick.ask - tick.bid) / pip
        if spread_pips > max_spread_pips:
            self.log.warning(f'SPREAD BLOCK {pair}: {spread_pips:.1f}p > max {max_spread_pips}p')
            self.last_reject_reason = f'spread {spread_pips:.1f}p > max {max_spread_pips}p'
            return None

        existing = [p for p in (mt5.positions_get(symbol=mt5_sym) or []) if p.magic == self.magic]
        if dedupe_tag is not None:
            tag = f'[{dedupe_tag}]'
            existing = [p for p in existing if tag in (p.comment or '')]
        if existing:
            self.log.warning(f'DUPLICATE BLOCK {pair}: ticket {existing[0].ticket} already open')
            self.last_reject_reason = f'duplicate (ticket {existing[0].ticket} already open)'
            return None

        order_type = mt5.ORDER_TYPE_BUY if direction == 'LONG' else mt5.ORDER_TYPE_SELL
        exec_price = tick.ask if direction == 'LONG' else tick.bid

        # Normalise the risk-sized lot to the symbol's own volume constraints
        # (min / max / step). A raw lot that violates them is rejected outright with
        # "Invalid volume argument" (retcode -2) — e.g. an index CFD like US2000
        # whose volume_max is below the sized lot, which then re-fires every tick.
        vol = self._norm_volume(info, lots)
        if not vol or vol <= 0:
            self.log.error(f'{pair}: volume {lots} normalises to {vol} for {mt5_sym} — skipping')
            self.last_reject_reason = f'invalid_volume ({lots} -> {vol})'
            return None
        if abs(vol - lots) > 1e-9:
            self.log.info(f'{pair}: volume {lots} → {vol} (min {getattr(info, "volume_min", None)} '
                          f'max {getattr(info, "volume_max", None)} step {getattr(info, "volume_step", None)})')

        # MT5 order comments must be short ASCII — a non-ASCII char (·, ×, →) or an
        # over-long string is rejected with "Invalid comment argument".
        safe_comment = self._safe_comment(comment, f'Bot {direction[0]}')

        digits = getattr(info, 'digits', None) or 5
        order = {
            'action':       mt5.TRADE_ACTION_DEAL,
            'symbol':       mt5_sym,
            'volume':       vol,
            'type':         order_type,
            'price':        exec_price,
            'sl':           round(sl, digits),
            'deviation':    self.deviation,
            'magic':        self.magic,
            'comment':      safe_comment,
            'type_time':    mt5.ORDER_TIME_GTC,
            'type_filling': self.filling_mode(mt5_sym),
        }
        if tp and tp > 0:
            order['tp'] = round(tp, digits)

        res = mt5.order_send(order)

        # order_send returns None on a transport error — capture last_error first.
        if res is None:
            self.log.error(f'MT5 order_send returned None (transport error)  last_error={mt5.last_error()}')
            time.sleep(0.5)
            tick = mt5.symbol_info_tick(mt5_sym)
            if tick:
                order['price'] = tick.ask if direction == 'LONG' else tick.bid
                res = mt5.order_send(order)
                if res is None:
                    self.log.error(f'MT5 retry also returned None  last_error={mt5.last_error()}')
                    self.last_reject_reason = f'transport_error {mt5.last_error()}'
                    return None

        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            self.log.info(f'MT5 order placed: ticket={res.order}  exec_price={exec_price}')
            return res.order

        # Benign market-state rejections (trade disabled / market closed) are not bugs —
        # they happen at session edges the trade_mode guard above can't always pre-empt
        # (some brokers keep trade_mode=FULL and only reject at order time). Log at
        # warning, not error, so they don't read as failures in the alert stream.
        rc = getattr(res, 'retcode', None)
        benign = {getattr(mt5, 'TRADE_RETCODE_TRADE_DISABLED', 10017),
                  getattr(mt5, 'TRADE_RETCODE_MARKET_CLOSED', 10018)}
        msg = (f'MT5 order failed: retcode={rc} '
               f'comment={getattr(res, "comment", "")}  last_error={mt5.last_error()}')
        if rc in benign:
            self.log.warning(msg + ' — market not tradable now, skipping')
            self.last_reject_reason = f'market_not_tradable (retcode={rc})'
        else:
            self.log.error(msg)
            self.last_reject_reason = f'order_rejected (retcode={rc})'
        return None

    def stop(
        self,
        ticket: int,
        pair: str,
        paper_mode: bool,
        reason: str = '',
        comment_prefix: str = 'Close',
    ) -> bool:
        """Close a position by ticket. Returns True on success (or already-gone /
        paper). Mirrors regime_bot.close_position."""
        self.log.info(f'CLOSE {pair}  ticket={ticket}  reason={reason}' + ('  [PAPER]' if paper_mode else ''))

        if paper_mode or ticket < 0:
            return True
        if not self.available:
            return False

        mt5 = self.mt5
        mt5_sym = self.resolve(pair)
        positions = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                     if p.ticket == ticket and p.magic == self.magic]
        if not positions:
            self.log.warning(f'Ticket {ticket} not found — may already be closed by SL/TP')
            return True

        pos = positions[0]
        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(mt5_sym)
        if not tick:
            return False
        close_price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask

        comment = (''.join(c for c in f'{comment_prefix} {reason}' if c.isalnum() or c == ' '))[:31]
        res = mt5.order_send({
            'action':       mt5.TRADE_ACTION_DEAL,
            'symbol':       mt5_sym,
            'volume':       float(pos.volume),
            'type':         close_type,
            'position':     ticket,
            'price':        close_price,
            'deviation':    self.deviation,
            'magic':        self.magic,
            'comment':      comment,
            'type_time':    mt5.ORDER_TIME_GTC,
            'type_filling': self.filling_mode(mt5_sym),
        })

        if res is None:
            self.log.error(f'Close failed: order_send returned None  last_error={mt5.last_error()}')
            return False
        if res.retcode == mt5.TRADE_RETCODE_DONE:
            self.log.info(f'Position {ticket} closed at {close_price}')
            return True

        self.log.error(
            f'Close failed: retcode={res.retcode}  comment={res.comment}  last_error={mt5.last_error()}'
        )
        return False

    def modify(self, ticket: int, pair: str, sl: float, tp: float | None = None,
               paper_mode: bool = False) -> bool:
        """Update a live position's SL (and optionally TP) — used to trail the
        chandelier stop BROKER-SIDE so the exit survives the bot going offline.
        Returns True on success (or paper / already-closed)."""
        if paper_mode or ticket < 0:
            return True
        if not self.available:
            return False
        mt5 = self.mt5
        mt5_sym = self.resolve(pair)
        positions = [p for p in (mt5.positions_get(symbol=mt5_sym) or [])
                     if p.ticket == ticket and p.magic == self.magic]
        if not positions:
            return True                       # already closed by SL — nothing to trail
        # Round to the SYMBOL's own price digits (e.g. 3 for JPY pairs), not a
        # hardcoded 5 — otherwise a sub-tick chandelier nudge looks like a real
        # improvement locally but collapses to the SAME value once MT5 rounds it,
        # and every attempt comes back retcode 10025 "No changes" forever.
        info = mt5.symbol_info(mt5_sym)
        digits = getattr(info, 'digits', None) or 5
        if round(float(sl), digits) == round(float(positions[0].sl), digits):
            return True                       # broker already holds this SL — no-op, not a failure
        req = {'action': mt5.TRADE_ACTION_SLTP, 'symbol': mt5_sym,
               'position': ticket, 'sl': round(float(sl), digits), 'magic': self.magic}
        if tp is not None:
            req['tp'] = round(float(tp), digits)
        res = mt5.order_send(req)
        if res is None:
            self.log.error(f'Modify failed: order_send None  last_error={mt5.last_error()}')
            return False
        if res.retcode == mt5.TRADE_RETCODE_DONE:
            return True
        self.log.warning(f'Modify {ticket} retcode={res.retcode} comment={getattr(res, "comment", "")}')
        return False

    def tradable(self, pair: str) -> bool:
        """True if the broker currently allows OPENING a trade on this symbol. MT5
        disables index/CFD trading outside session hours (the retcode-10017 'Trade
        disabled'); this lets the bot skip a closed market cleanly instead of firing
        a rejected order. Unknown/uncheckable → True (don't block)."""
        if not self.available:
            return True
        info = self.mt5.symbol_info(self.resolve(pair))
        if info is None:
            return True
        disabled = (self.mt5.SYMBOL_TRADE_MODE_DISABLED, self.mt5.SYMBOL_TRADE_MODE_CLOSEONLY)
        return info.trade_mode not in disabled
