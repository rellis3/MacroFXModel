"""PaperBroker — an in-memory broker so the bot runs end-to-end with NO MT5.

Exposes the SAME surface as the canonical ``Mt5Broker`` (connect / price /
account_balance / enter / stop / serialize_open_positions /
serialize_closed_trades) so a bot swaps live↔paper with no code change. Adds
``set_price`` (the loop feeds it) and ``check_barriers`` which closes a position
when price hits its TP/SL — mirroring MT5's native SL/TP execution of the triple
barrier. Pure + offline-testable; used whenever paper_mode is on (the default).

Measurement contract (this broker is a paper-trading INSTRUMENT, so its numbers
must be money, not price deltas):

* **P&L is in account currency** — profit = (Δprice / pip) × pip_value × lots,
  signed by direction, using the canonical pip table (pylego.instruments) and
  the sizing point-value table (pylego.point_values) — the SAME resolution
  ``position_size`` sizes with. Unknown symbols fall back to the FX default
  (pip 0.0001, $10/pip/lot), mirroring the bots' ``size_for`` fallback.
* **The balance MOVES** — every ``stop()`` adds the realized profit to the
  balance ``account_balance()`` returns, so sizing compounds and drawdown logic
  can rehearse, exactly as live.
* **Fills pay the spread** — entries fill at mid ± spread/2 (BUY above, SELL
  below) and exits cross the other half, so a round trip costs exactly ONE full
  spread. Barrier TRIGGERS still evaluate on the fed mid (slightly conservative
  vs MT5's bid/ask trigger: an SL exit fills half a spread beyond the stop).
  Per-pair defaults come from ``pylego.costs.DEFAULT_SPREAD_PIPS`` (single
  source, per asset class); override per pair with ``set_spread(pair,
  spread_price_units)`` or the ``spreads`` ctor dict.
"""
from __future__ import annotations

import time

from pylego.costs import default_spread
from pylego.instruments import pip_size
from pylego.point_values import point_value


class PaperBroker:
    available = True

    def __init__(self, balance: float = 10_000.0, spreads: dict | None = None):
        self._bal = float(balance)
        self._next = 1
        self._pos: dict[int, dict] = {}
        self._closed: list[dict] = []
        self._price: dict[str, float] = {}
        self._session: dict[str, list] = {}
        self._spread: dict[str, float] = {}     # pair -> spread override, PRICE units
        self._pipcache: dict[str, tuple] = {}   # pair -> (pip, pip_value)
        for pair, s in (spreads or {}).items():
            self.set_spread(pair, s)
        self.last_reject_reason: str | None = None   # mirrors Mt5Broker's side-channel; see its own doc

    # ── connection (no-op for paper) ──────────────────────────────────────────
    def connect(self, account=None, password=None, server=None, path=None) -> bool:
        return True

    def shutdown(self) -> None:
        pass

    # ── market data (fed by the loop) ─────────────────────────────────────────
    def set_price(self, pair: str, px: float) -> None:
        px = float(px)
        self._price[pair] = px
        # Track each open position's favourable / adverse price water-marks so a
        # closed trade can report its MFE/MAE (peak profit reached vs the exit) —
        # the give-back diagnostic. Additive only: does not touch fills or exits.
        for p in self._pos.values():
            if p['pair'] != pair:
                continue
            if p['direction'] == 'LONG':
                if px > p['fav_price']: p['fav_price'] = px
                if px < p['adv_price']: p['adv_price'] = px
            else:
                if px < p['fav_price']: p['fav_price'] = px
                if px > p['adv_price']: p['adv_price'] = px

    def price(self, pair: str):
        return self._price.get(pair)

    def set_spread(self, pair: str, spread: float) -> None:
        """Override the spread for ``pair``, in PRICE units (e.g. 0.00008 for a
        0.8-pip EUR/USD spread, 0.30 for gold). Defaults come from
        pylego.costs.default_spread when no override is set."""
        self._spread[pair] = max(0.0, float(spread))

    def spread(self, pair: str) -> float:
        """Effective spread for ``pair`` in PRICE units (override → class default)."""
        s = self._spread.get(pair)
        return s if s is not None else default_spread(pair)

    def set_session_bars(self, pair: str, bars: list) -> None:
        """Test/sim hook: supply the session's OHLC bars the bot replays on
        catch_up (paper has no real feed)."""
        self._session.setdefault(pair, [])
        self._session[pair] = list(bars)

    def session_bars(self, pair: str, since_epoch=None) -> list:
        return list(self._session.get(pair, []))

    def account_balance(self):
        """The MOVING paper balance: starting balance + every realized profit
        booked by stop(). Sizing off this compounds, exactly as live."""
        return self._bal

    # ── money conversion (the same resolution position_size sizes with) ───────
    def _pip_and_value(self, pair: str) -> tuple:
        pv = self._pipcache.get(pair)
        if pv is None:
            try:
                pv = (pip_size(pair), point_value(pair, default=10.0))
            except Exception:
                pv = (0.0001, 10.0)             # mirrors the bots' size_for fallback
            self._pipcache[pair] = pv
        return pv

    def _profit(self, pair: str, open_price: float, close_price: float,
                direction: str, lots: float) -> float:
        """Account-currency P&L: (Δprice / pip) × pip_value × lots, signed by
        direction — gold points and FX fractions land in the same money units."""
        pip, pip_value = self._pip_and_value(pair)
        sign = 1 if direction == "LONG" else -1
        return (close_price - open_price) * sign / pip * pip_value * lots

    # ── orders (mirror Mt5Broker.enter/stop signatures) ───────────────────────
    def enter(self, pair, direction, sl, tp, lots, max_spread_pips, paper_mode, comment=None,
              dedupe_tag=None):
        """Simulate a market fill at the current price. direction 'LONG'/'SHORT'.
        Returns a positive paper ticket (the bot only uses PaperBroker in paper
        mode, where we want real position tracking + barrier exits).

        The fill CROSSES half the spread: BUY at mid + spread/2, SELL at
        mid − spread/2 (the exit crosses the other half — see stop()).

        ``dedupe_tag`` mirrors ``Mt5Broker.enter``: when given, blocks the fill if
        a position already open on ``pair`` has ``[{dedupe_tag}]`` in its comment
        (unset by default — paper stacks freely, same as before)."""
        self.last_reject_reason = None
        mid = self._price.get(pair)
        if mid is None:
            self.last_reject_reason = 'no_price_yet'
            return None
        if dedupe_tag is not None:
            tag = f'[{dedupe_tag}]'
            existing = [p for p in self._pos.values() if p['pair'] == pair and tag in (p.get('comment') or '')]
            if existing:
                self.last_reject_reason = f"duplicate (ticket {existing[0]['ticket']} already open)"
                return None
        half = self.spread(pair) / 2.0
        px = mid + half if direction == "LONG" else mid - half
        t = self._next
        self._next += 1
        self._pos[t] = {"ticket": t, "pair": pair, "direction": direction,
                        "lots": float(lots), "open_price": px, "sl": float(sl), "tp": float(tp),
                        "comment": comment or "", "time_open": int(time.time()),
                        # MFE/MAE water-marks — seeded at the fill, moved by set_price.
                        "fav_price": px, "adv_price": px}
        return t

    def _exit_price(self, pair: str, direction: str):
        """Exit-side mark for an open position: mid ∓ spread/2 (a LONG sells the
        bid, a SHORT buys the ask) — the price stop() would realize right now.
        None when no price has been fed."""
        mid = self._price.get(pair)
        if mid is None:
            return None
        half = self.spread(pair) / 2.0
        return mid - half if direction == "LONG" else mid + half

    def stop(self, ticket, pair=None, paper_mode=True, reason="", comment_prefix="Close") -> bool:
        p = self._pos.pop(ticket, None)
        if not p:
            return True                       # already gone
        # Exit crosses the other half of the spread (entry paid the first half →
        # the round trip costs exactly one full spread). No price ever fed →
        # close at the fill (profit 0), never a fabricated spread charge.
        close = self._exit_price(p["pair"], p["direction"])
        if close is None:
            close = p["open_price"]
        profit = self._profit(p["pair"], p["open_price"], close, p["direction"], p["lots"])
        self._bal += profit                   # realized P&L moves the paper balance
        # MFE/MAE from the tracked water-marks (favourable/adverse pip distance
        # off the entry, always signed so MFE>=0, MAE<=0). Never assumes the path
        # — the marks are the extremes actually seen while the position was open.
        pip, _ = self._pip_and_value(p["pair"])
        mfe_pips = round(abs(p.get("fav_price", p["open_price"]) - p["open_price"]) / pip, 1)
        mae_pips = -round(abs(p.get("adv_price", p["open_price"]) - p["open_price"]) / pip, 1)
        self._closed.append({**p, "reason": reason, "close_price": close,
                             "profit": profit, "time_close": int(time.time()),
                             "mfe_pips": mfe_pips, "mae_pips": mae_pips})
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
            # Mark at the exit-side price (like MT5's price_current: bid for a
            # long) so the unrealized profit matches what stop() would realize.
            cur = self._exit_price(p["pair"], p["direction"])
            if cur is None:
                cur = p["open_price"]
            profit = self._profit(p["pair"], p["open_price"], cur, p["direction"], p["lots"])
            out.append({
                "ticket": t, "symbol": p["pair"],
                "direction": "BUY" if p["direction"] == "LONG" else "SELL",
                "lots": round(p["lots"], 2), "open_price": round(p["open_price"], 5),
                "price": round(cur, 5), "profit": round(profit, 4), "swap": 0.0,
                "time_open": p.get("time_open"),
                # Paper fills are stamped with time.time() — already true UTC, so
                # the offset is a hard 0. Emitted (not omitted) so the dashboard
                # can distinguish "UTC" from "unknown base" on a mixed table where
                # Mt5Broker rows carry the broker's +2/+3h.
                "tz_offset_sec": 0,
                # comment carries "Vol {line} {decision}" — the dashboard parses it to
                # show WHICH line each open position is fading. Mt5Broker already emits
                # it (PYTHON_LEGO.md §7); paper must match or the line is lost in paper mode.
                "comment": p.get("comment", ""),
            })
        return out

    def serialize_closed_trades(self) -> list:
        # position_id is REQUIRED: the server's mergeTradeHistory dedups on it, so a
        # closed trade without it is dropped and never reaches the Trade History tab.
        # profit is in ACCOUNT CURRENCY (same units as Mt5Broker) — not a price delta.
        return [{
            "position_id": c["ticket"], "ticket": c["ticket"],
            "symbol": c["pair"], "direction": "BUY" if c["direction"] == "LONG" else "SELL",
            "lots": round(c["lots"], 2), "open_price": round(c["open_price"], 5),
            "close_price": round(c["close_price"], 5) if c.get("close_price") is not None else None,
            "profit": round(c.get("profit", 0.0), 4), "reason": c.get("reason"),
            "time_open": c.get("time_open"), "time_close": c.get("time_close"),
            # Already true UTC (time.time()) — see serialize_open_positions.
            "tz_offset_sec": 0,
            # MFE/MAE in pips (peak favourable / worst adverse) — the give-back
            # inputs; the server rollup persists them into *_trade_log.
            "mfe_pips": c.get("mfe_pips"), "mae_pips": c.get("mae_pips"),
            # comment: carries the caller's own per-strategy tag (e.g. Fib
            # Atlas's "FA[dedupe_tag]") through to the closed-trade record —
            # Mt5Broker's serialize_closed_trades already emits this (see its
            # own docstring); paper must match or a paper-mode trade loses
            # its identifying tag the moment it closes.
            "comment": c.get("comment", ""),
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
