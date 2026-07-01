"""PaperBroker — an in-memory broker so the bot runs end-to-end with NO MT5.

Exposes the SAME surface as the canonical ``Mt5Broker`` (connect / price /
account_balance / enter / stop / serialize_open_positions /
serialize_closed_trades) so a bot swaps live↔paper with no code change. Adds
``set_price`` (the loop feeds it) and ``check_barriers`` which closes a position
when price hits its TP/SL — mirroring MT5's native SL/TP execution of the triple
barrier. Pure + offline-testable; used whenever paper_mode is on (the default).
"""
from __future__ import annotations

import time


class PaperBroker:
    available = True

    def __init__(self, balance: float = 10_000.0):
        self._bal = float(balance)
        self._next = 1
        self._pos: dict[int, dict] = {}
        self._closed: list[dict] = []
        self._price: dict[str, float] = {}
        self._session: dict[str, list] = {}

    # ── connection (no-op for paper) ──────────────────────────────────────────
    def connect(self, account=None, password=None, server=None, path=None) -> bool:
        return True

    def shutdown(self) -> None:
        pass

    # ── market data (fed by the loop) ─────────────────────────────────────────
    def set_price(self, pair: str, px: float) -> None:
        self._price[pair] = float(px)

    def price(self, pair: str):
        return self._price.get(pair)

    def set_session_bars(self, pair: str, bars: list) -> None:
        """Test/sim hook: supply the session's OHLC bars the bot replays on
        catch_up (paper has no real feed)."""
        self._session.setdefault(pair, [])
        self._session[pair] = list(bars)

    def session_bars(self, pair: str, since_epoch=None) -> list:
        return list(self._session.get(pair, []))

    def account_balance(self):
        return self._bal

    # ── orders (mirror Mt5Broker.enter/stop signatures) ───────────────────────
    def enter(self, pair, direction, sl, tp, lots, max_spread_pips, paper_mode, comment=None):
        """Simulate a market fill at the current price. direction 'LONG'/'SHORT'.
        Returns a positive paper ticket (the bot only uses PaperBroker in paper
        mode, where we want real position tracking + barrier exits)."""
        px = self._price.get(pair)
        if px is None:
            return None
        t = self._next
        self._next += 1
        self._pos[t] = {"ticket": t, "pair": pair, "direction": direction,
                        "lots": float(lots), "open_price": px, "sl": float(sl), "tp": float(tp),
                        "comment": comment or "", "time_open": int(time.time())}
        return t

    def stop(self, ticket, pair=None, paper_mode=True, reason="", comment_prefix="Close") -> bool:
        p = self._pos.pop(ticket, None)
        if not p:
            return True                       # already gone
        close = self._price.get(p["pair"], p["open_price"])
        sign  = 1 if p["direction"] == "LONG" else -1
        profit = (close - p["open_price"]) * sign * p["lots"]
        self._closed.append({**p, "reason": reason, "close_price": close,
                             "profit": profit, "time_close": int(time.time())})
        return True

    def modify(self, ticket, pair=None, sl=None, tp=None, paper_mode=True) -> bool:
        """Update a position's SL/TP (mirrors Mt5Broker.modify) — the bot trails the
        chandelier stop by raising the SL; check_barriers then exits on the SL."""
        p = self._pos.get(ticket)
        if not p:
            return True
        if sl is not None:
            p["sl"] = float(sl)
        if tp is not None:
            p["tp"] = float(tp)
        return True

    def tradable(self, pair) -> bool:
        return True                           # paper: always open

    # ── serialisers (the dashboard positions-tab payload — Mt5Broker shape) ────
    def serialize_open_positions(self) -> list:
        out = []
        for t, p in self._pos.items():
            cur = self._price.get(p["pair"], p["open_price"])
            sign = 1 if p["direction"] == "LONG" else -1
            profit = (cur - p["open_price"]) * sign * p["lots"]
            out.append({
                "ticket": t, "symbol": p["pair"],
                "direction": "BUY" if p["direction"] == "LONG" else "SELL",
                "lots": round(p["lots"], 2), "open_price": round(p["open_price"], 5),
                "price": round(cur, 5), "profit": round(profit, 4), "swap": 0.0,
                "time_open": p.get("time_open"),
            })
        return out

    def serialize_closed_trades(self) -> list:
        # position_id is REQUIRED: the server's mergeTradeHistory dedups on it, so a
        # closed trade without it is dropped and never reaches the Trade History tab.
        return [{
            "position_id": c["ticket"], "ticket": c["ticket"],
            "symbol": c["pair"], "direction": "BUY" if c["direction"] == "LONG" else "SELL",
            "lots": round(c["lots"], 2), "open_price": round(c["open_price"], 5),
            "close_price": round(c["close_price"], 5) if c.get("close_price") is not None else None,
            "profit": round(c.get("profit", 0.0), 4), "reason": c.get("reason"),
            "time_open": c.get("time_open"), "time_close": c.get("time_close"),
        } for c in self._closed[-50:]]

    # ── triple-barrier execution (what MT5 does natively via SL/TP) ────────────
    def check_barriers(self) -> list:
        hit = []
        for t, p in list(self._pos.items()):
            cur = self._price.get(p["pair"])
            if cur is None:
                continue
            # tp falsy (0/None) = no take-profit (the chandelier-trailed SL is the exit).
            if p["direction"] == "LONG":
                reason = "sl" if cur <= p["sl"] else ("tp" if p["tp"] and cur >= p["tp"] else None)
            else:
                reason = "sl" if cur >= p["sl"] else ("tp" if p["tp"] and cur <= p["tp"] else None)
            if reason:
                self.stop(t, p["pair"], True, reason)
                hit.append({"ticket": t, "reason": reason})
        return hit
