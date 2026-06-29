"""MT5Broker — the live execution brick (Category-B).

Same surface as PaperBroker (price/balance/open/positions/close) so the bot is
broker-agnostic. A thin wrapper over the MetaTrader5 API, extracted from
bot/regime_bot.py's connect/order/serialize so the new bot and (later) the
regime bots share ONE implementation instead of N copies.

⚠ Cannot run in CI/sandbox (no MT5 terminal). py_compile-checked here; the live
connect/order/fill paths must be verified in a paper MT5 terminal. Order SL/TP
are sent natively, so MT5 executes the triple barrier server-side.
"""
from __future__ import annotations

import logging

log = logging.getLogger("volatility_bot.mt5")

try:
    import MetaTrader5 as mt5  # type: ignore
    HAS_MT5 = True
except Exception:               # not installed (e.g. CI/sandbox)
    mt5 = None
    HAS_MT5 = False


class MT5Broker:
    def __init__(self, magic: int, sym_for, path: str = "", logger=None):
        self.magic = int(magic)
        self.sym_for = sym_for           # callable: pair → broker symbol (local override map)
        self.path = path
        self.log = logger or log

    # ── connection ────────────────────────────────────────────────────────────
    def connect(self, account=None, password=None, server=None) -> bool:
        if not HAS_MT5:
            self.log.warning("MetaTrader5 not installed — use PaperBroker")
            return False
        ok = mt5.initialize(path=self.path) if self.path else mt5.initialize()
        if not ok:
            self.log.error(f"MT5 initialize() failed: {mt5.last_error()}")
            return False
        if account and password and server:
            try:
                if not mt5.login(int(account), password, server):
                    self.log.error(f"MT5 login() failed: {mt5.last_error()}")
                    return False
            except Exception as exc:
                self.log.error(f"MT5 login() raised: {exc}")
                return False
        info = mt5.account_info()
        if not info:
            self.log.error("MT5 account_info() returned None")
            return False
        # Guard: never trade the wrong account if creds were partial.
        if account and str(info.login) != str(account):
            self.log.error(f"MT5 account mismatch: expected {account}, got {info.login}")
            mt5.shutdown()
            return False
        self.log.info(f"MT5 connected account={info.login} balance={info.balance:.2f} {info.currency}")
        return True

    def shutdown(self):
        if HAS_MT5:
            mt5.shutdown()

    # ── market data ─────────────────────────────────────────────────────────────
    def price(self, pair: str):
        if not HAS_MT5:
            return None
        tick = mt5.symbol_info_tick(self.sym_for(pair))
        if not tick:
            return None
        return (tick.bid + tick.ask) / 2 if tick.bid and tick.ask else (tick.bid or tick.ask)

    def balance(self) -> float:
        info = mt5.account_info() if HAS_MT5 else None
        return float(info.balance) if info else 0.0

    def _filling_mode(self, sym: str):
        info = mt5.symbol_info(sym)
        am = getattr(info, "filling_mode", 0) if info else 0
        if am & 1:
            return mt5.ORDER_FILLING_FOK
        if am & 4:
            return mt5.ORDER_FILLING_RETURN
        return mt5.ORDER_FILLING_IOC

    # ── orders ────────────────────────────────────────────────────────────────
    def open(self, spec: dict):
        """spec = {pair, side('buy'/'sell'), lots, sl, tp, comment?}. Returns the
        ticket on success, None on failure. SL/TP are sent so MT5 manages the exit."""
        if not HAS_MT5:
            return None
        sym = self.sym_for(spec["pair"])
        tick = mt5.symbol_info_tick(sym)
        if not tick:
            self.log.error(f"{spec['pair']}: no tick for {sym}")
            return None
        is_buy = spec["side"] == "buy"
        # One position per (symbol, magic) — no pyramiding.
        existing = [p for p in (mt5.positions_get(symbol=sym) or []) if p.magic == self.magic]
        if existing:
            self.log.warning(f"DUPLICATE BLOCK {spec['pair']}: ticket {existing[0].ticket} open")
            return None
        order = {
            "action": mt5.TRADE_ACTION_DEAL, "symbol": sym, "volume": float(spec["lots"]),
            "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
            "price": tick.ask if is_buy else tick.bid,
            "sl": float(spec["sl"]), "tp": float(spec["tp"]),
            "magic": self.magic, "comment": spec.get("comment", "VolBot")[:31],
            "type_time": mt5.ORDER_TIME_GTC, "type_filling": self._filling_mode(sym),
        }
        res = mt5.order_send(order)
        if res is None:
            self.log.error(f"MT5 order_send None (transport) last_error={mt5.last_error()}")
            return None
        if res.retcode == mt5.TRADE_RETCODE_DONE:
            return res.order
        self.log.error(f"MT5 order rejected retcode={res.retcode} comment={getattr(res, 'comment', '')}")
        return None

    def close(self, ticket: int, reason: str = "") -> bool:
        if not HAS_MT5:
            return True
        positions = [p for p in (mt5.positions_get() or []) if p.ticket == ticket]
        if not positions:
            return False
        p = positions[0]
        tick = mt5.symbol_info_tick(p.symbol)
        is_buy = p.type == mt5.ORDER_TYPE_BUY
        order = {
            "action": mt5.TRADE_ACTION_DEAL, "symbol": p.symbol, "volume": p.volume,
            "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
            "price": tick.bid if is_buy else tick.ask, "position": ticket,
            "magic": self.magic, "comment": f"close {reason}"[:31],
            "type_time": mt5.ORDER_TIME_GTC, "type_filling": self._filling_mode(p.symbol),
        }
        res = mt5.order_send(order)
        return bool(res and res.retcode == mt5.TRADE_RETCODE_DONE)

    def positions(self) -> list[dict]:
        if not HAS_MT5:
            return []
        out = []
        for p in (mt5.positions_get() or []):
            if p.magic != self.magic:
                continue
            out.append({
                "ticket": p.ticket, "symbol": p.symbol,
                "direction": "LONG" if p.type == mt5.ORDER_TYPE_BUY else "SHORT",
                "lots": float(p.volume), "open_price": float(p.price_open),
                "price_current": float(p.price_current), "profit": round(float(p.profit), 2),
                "swap": round(float(p.swap), 2),
            })
        return out
