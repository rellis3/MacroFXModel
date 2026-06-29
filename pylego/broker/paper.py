"""PaperBroker — an in-memory broker so the bot runs end-to-end with NO MT5.

Implements the same surface as the live MT5Broker (price/balance/open/positions/
close) plus ``check_barriers`` which closes a paper position when price hits its
TP or SL — mirroring MT5's native SL/TP execution of the triple barrier. Pure +
offline-testable; the bot uses it whenever paper_mode is on (the default).
"""
from __future__ import annotations


class PaperBroker:
    def __init__(self, balance: float = 10_000.0):
        self._bal = float(balance)
        self._next = 1
        self._pos: dict[int, dict] = {}
        self.closed: list[dict] = []
        self._price: dict[str, float] = {}

    # ── market data (fed by the loop) ─────────────────────────────────────────
    def set_price(self, pair: str, px: float) -> None:
        self._price[pair] = float(px)

    def price(self, pair: str):
        return self._price.get(pair)

    def balance(self) -> float:
        return self._bal

    # ── orders ────────────────────────────────────────────────────────────────
    def open(self, spec: dict):
        """spec = {pair, side('buy'/'sell'), lots, entry, tp, sl, comment?}.
        Returns a paper ticket (negative-free, just an int)."""
        t = self._next
        self._next += 1
        entry = spec.get("entry") or self._price.get(spec["pair"])
        self._pos[t] = {**spec, "ticket": t, "open_price": entry}
        return t

    def close(self, ticket: int, reason: str = "") -> bool:
        p = self._pos.pop(ticket, None)
        if not p:
            return False
        self.closed.append({**p, "reason": reason, "close_price": self._price.get(p["pair"])})
        return True

    def positions(self) -> list[dict]:
        """Open positions serialized to the shape the positions page expects."""
        out = []
        for t, p in self._pos.items():
            cur = self._price.get(p["pair"], p["open_price"])
            sign = 1 if p["side"] == "buy" else -1
            profit = (cur - p["open_price"]) * sign * float(p.get("lots", 0.0))
            out.append({
                "ticket": t, "symbol": p["pair"],
                "direction": "LONG" if p["side"] == "buy" else "SHORT",
                "lots": float(p.get("lots", 0.0)),
                "open_price": p["open_price"], "price_current": cur,
                "profit": round(profit, 4), "swap": 0.0,
            })
        return out

    # ── triple-barrier execution (what MT5 does natively via SL/TP) ────────────
    def check_barriers(self) -> list[dict]:
        """Close any paper position whose latest price reached TP or SL. Returns
        the list of {ticket, reason} closed this call."""
        hit = []
        for t, p in list(self._pos.items()):
            cur = self._price.get(p["pair"])
            if cur is None:
                continue
            if p["side"] == "buy":
                reason = "sl" if cur <= p["sl"] else "tp" if cur >= p["tp"] else None
            else:
                reason = "sl" if cur >= p["sl"] else "tp" if cur <= p["tp"] else None
            if reason:
                self.close(t, reason)
                hit.append({"ticket": t, "reason": reason})
        return hit
