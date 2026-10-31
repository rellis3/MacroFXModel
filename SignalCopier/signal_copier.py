"""signal_copier — ColezTrades Telegram signals → MT5, run like every other bot.

Listens to the ColezTrades | Private → Signals topic as YOUR Telegram account
(Telethon user client), turns each message into book transitions
(parser.py / book.py), executes them on MT5 (or PaperBroker), and keeps a
per-signal outcome record in the COG import-template format (outcome.py).

  python SignalCopier/signal_copier.py --url https://macrofxmodel-production.up.railway.app            # paper (default)
  python SignalCopier/signal_copier.py --url ... --live                                                  # live MT5
  python SignalCopier/signal_copier.py --url ... --backfill-since 2025-01-01                             # rebuild the signal record from history, then exit

Everything is set on the bot config page (📡 Signal Copier tab) and flows through KV:

  signal_copier_config          risk, styles, symbol map, chat/topic, alerts   (dashboard → bot)
  signal_copier_credentials     MT5 login                                        (dashboard → bot)
  signal_copier_tg_credentials  Telegram api_id / api_hash / phone               (dashboard → bot)
  signal_copier_tg_login        one-shot login code / 2FA password; the bot clears it after use
  signal_copier_status          positions, pending orders, book, Telegram state (bot → dashboard, ~30s)
  signal_copier_state           book + executions, so a restart resumes        (bot)
  signal_copier_decision_log    every action and why                           (bot)
  signal_copier_signals         per-signal outcomes + template rows            (bot)

The Telegram SESSION (what a login produces) never leaves this machine: it is
the file SignalCopier/signalcopier.session. Treat it like a password.

Runs on the Windows box next to MT5, like the other MT5 bots. MT5 is also the
bar source for the outcome record; in paper mode the bot still connects to the
terminal for prices and bars when it can, and trades only on PaperBroker.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from pylego.kv import KvClient                                       # noqa: E402
from pylego import instruments as I                                   # noqa: E402
from pylego import point_values as PV                                  # noqa: E402
from pylego.sizing import position_size                                # noqa: E402
from pylego.broker.paper import PaperBroker                            # noqa: E402
from pylego.quotes import QuoteFeed                                     # noqa: E402
from pylego.costs import spread_for                                     # noqa: E402
from pylego.risk_guard import RiskGuard, block_category, log_block_transition  # noqa: E402

from book import Book, describe                                         # noqa: E402
from outcome import resolve, template_row                               # noqa: E402
from parser import has_trade_events, parse_message                      # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("signal_copier")

MAGIC = 20261030                                                 # must match pylego/magics.py -- pylego/magics_test.py enforces it
K = "signal_copier"
DEFAULT_CHAT = -1001606516039                                    # ColezTrades | Private
SESSION = str(HERE / "signalcopier")

DEFAULT_CFG = {
    "kill_switch": False,
    "paper_mode": True,             # never start fresh live -- same discipline as every other bot
    "risk_pct": 0.5,                # % of balance risked per signal (entry→SL)
    "record_risk_pct": 1.0,         # Risk % written to the template export (his "1R on each")
    "max_lot": 5.0,
    "max_open": 12,                 # open positions + resting orders this bot may hold
    "copy_swing": True,
    "copy_day": True,
    "copy_single": True,            # signals posted outside a Swings/Day section
    "ignore_crypto": True,          # crypto signals (BTCUSD…) are not traded, scored or exported -- the broker has none
    "symbol_map": {},               # his symbol -> broker symbol, e.g. {"NAS100": "USTECH100"}; blank = registry
    "skip_symbols": [],
    "max_signal_age_secs": 300,     # a MARKET signal older than this (restart, missed update) is not chased
    "max_entry_drift_r": 0.25,      # skip a market signal if price is already this many R worse than his entry
    "max_spread_r": 0.20,           # skip if the spread is more than this fraction of the stop distance (live: real MT5 spread)
    "limit_through": "market",      # limit already traded through (better price): "market" = take it now, "skip"
    "tg_chat": DEFAULT_CHAT,
    "tg_topic": None,               # "Signals" topic id; None = whole group
    "tg_senders": "",               # comma list of trusted sender names/ids; blank = everyone
    "poll_secs": 5,
    "status_secs": 30,
    "resolve_secs": 60,
    # Risk guard (pylego.risk_guard, shared with every bot). Daily/monthly drawdown
    # lockout ON by default for a copier: his signals arrive in correlated batches.
    # Cooldown 0: a per-symbol cooldown would block his second signal on a symbol.
    "risk_guard_enabled": True,
    "ddlimit": 3.0,
    "monthlydd": 6.0,
    "lockout": 3,
    "cooldown": 0,
    "retry_rejects": 3,             # re-try a broker reject (requote, market closed…) this many times, 60s apart
    "tg_enabled": True,             # alerts to your own bot chat
    "tg_token": "",
    "tg_chat_id": "",
}

LIVE_EXEC = ("pending", "open")
DECISION_LOG_MAX_EVENTS = 50_000
REJECT_RETRY_SECS = 60
# broker rejects worth retrying: the order itself was fine, the market wasn't
RETRYABLE = ("transport_error", "order_rejected", "market_not_tradable", "no_tick", "trade_disabled")
# his usual symbols, checked against the broker at start
CRYPTO_BASES = ("BTC", "XBT", "ETH", "SOL", "XRP", "LTC", "BCH", "ADA", "DOGE", "DOT", "LINK", "BNB", "AVAX",
                "MATIC", "POL", "SHIB", "TRX", "XLM", "XMR", "UNI", "ATOM", "TON", "PEPE", "ETC", "NEAR", "APT", "SUI")


def is_crypto(symbol: str) -> bool:
    """BTCUSD, ETHUSDT, XRPEUR, BTC… → True. The instrument registry carries no
    crypto, so this goes by the base coin."""
    s = str(symbol or "").upper().replace("/", "").replace("_", "")
    return any(s.startswith(b) and s[len(b):] in ("", "USD", "USDT", "USDC", "EUR", "GBP", "JPY") for b in CRYPTO_BASES)


USUAL_SYMBOLS = ("NAS100", "US30", "SP500", "XAUUSD", "BTCUSD", "USDJPY", "EURJPY", "GBPJPY", "EURUSD", "GBPUSD")


def _deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def _now() -> float:
    return time.time()


def _tg_send(token, chat_id, text, reply_to=None):
    """Like pylego.telegram.send_telegram but returns the message_id, so a
    close alert can reply-thread onto its entry alert (same local helper as
    volatility_bot_v2 / motif_bot). Plain text: reasons can contain '<'."""
    if not token or not chat_id:
        return None
    try:
        import requests
        body = {"chat_id": chat_id, "text": text[:4000]}
        if reply_to:
            body["reply_to_message_id"] = reply_to
        j = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json=body, timeout=10).json()
        return j.get("result", {}).get("message_id") if j.get("ok") else None
    except Exception as e:
        log.warning(f"Telegram send failed: {e}")
        return None


def _fmt_close_alert(row, mode_tag):
    reason = (row.get("reason") or "").lower()
    tag = "✅ TP HIT" if reason == "tp" else "🛑 SL HIT" if reason == "sl" else "⚪ CLOSED"
    profit = row.get("profit")
    pnl = f"{'+' if (profit or 0) >= 0 else ''}{profit:.2f}" if profit is not None else "—"
    dur = ""
    to, tc = row.get("time_open"), row.get("time_close")
    if to and tc:
        h, m = divmod(max(0, int((tc - to) / 60)), 60)
        dur = f" · open {h}h{m:02d}m" if h else f" · open {m}m"
    return (f"{tag} {row.get('symbol')} {row.get('direction')}{mode_tag}\n"
            f"{row.get('open_price')} → {row.get('close_price')}\nP&L {pnl}{dur}  {row.get('comment') or ''}")


def _ts(iso):
    return datetime.fromisoformat(iso).timestamp() if iso else None


class Copier:
    """Everything except Telegram plumbing: book → broker, outcome record,
    status, decision log. Synchronous; the async loop calls into it."""

    def __init__(self, kv: KvClient, cfg: dict, force_live: bool):
        self.kv, self.cfg, self.force_live = kv, cfg, force_live
        self.paper = True
        self.broker = None           # executes (Mt5Broker live, PaperBroker paper)
        self.data = None             # prices + M1 bars (Mt5Broker when the terminal is reachable)
        self.quotes = None           # dashboard quote fallback when there is no MT5 data
        st = kv.get_json(f"{K}_state") or {}
        self.book = Book(data=st.get("book"))
        self.execs: dict[str, dict] = st.get("execs") or {}
        self.signals: dict[str, dict] = {r["id"]: r for r in (kv.get_json(f"{K}_signals") or {}).get("records", [])}
        self.decisions: list = list((kv.get_json(f"{K}_decision_log") or {}).get("events") or [])
        self.samples: dict[str, list] = {}        # id -> [(ts, px)] when there is no bar source
        self.tg = {"state": "starting", "detail": None, "chat": None, "last_msg_at": None, "msgs": 0}
        self.tg_master_on = True                  # ai_alert_cfg.tgMaster.signalCopier (⚙ Alerts modal)
        self.tg_entry_msgid: dict[str, int] = {str(k): v for k, v in (st.get("tg_entry_msgid") or {}).items()}
        self.tg_closed_alerted: set = set(st.get("tg_closed_alerted") or [])
        self.retries: dict[str, dict] = st.get("retries") or {}
        self.guard = RiskGuard(log=log)
        self.guard.sync_cfg(cfg)
        self.guard_state: dict = {}
        self.verified: set = set()
        self.symbol_problems: list = []
        self.dirty = {"state": False, "signals": False, "decisions": False}
        self.life = {"started_at": datetime.now(timezone.utc).isoformat(), "ticks": 0, "uptime_s": 0,
                     "decisions_today": {}, "last_resolve_at": None, "resolves": 0}
        self._boot = _now()
        self.account_login = None

    # ── setup ────────────────────────────────────────────────────────────
    def bsym(self, pair: str) -> str:
        m = {str(k).upper(): v for k, v in (self.cfg.get("symbol_map") or {}).items() if v}
        if pair.upper() in m:
            return m[pair.upper()]
        try:
            return I.mt5_symbol(pair)
        except Exception:
            return pair.upper()

    @staticmethod
    def pip(pair: str) -> float:
        try:
            return I.pip_size(pair)
        except Exception:
            return 0.0001 if pair.upper()[:3] not in ("BTC", "ETH") else 1.0

    def connect(self) -> bool:
        cfg = self.cfg
        if self.force_live:
            cfg["paper_mode"] = False
        self.paper = bool(cfg.get("paper_mode", True))
        creds = self.kv.get_json(f"{K}_credentials") or {}
        from pylego.broker.mt5 import Mt5Broker
        mt5b = Mt5Broker(MAGIC, self.bsym, self.pip, log=log)
        if mt5b.available:
            ok = (mt5b.connect(creds.get("mt5_account"), creds.get("mt5_password"), creds.get("mt5_server"),
                               creds.get("mt5_path") or None)
                  if creds.get("mt5_account") else bool(mt5b.mt5.initialize()))
            if ok:
                self.data = mt5b
                info = mt5b.mt5.account_info()
                self.account_login = getattr(info, "login", None)
        if not self.paper:
            if not creds.get("mt5_account"):
                log.error(f"live mode but no mt5_account in {K}_credentials -- save MT5 credentials on the bot page")
                return False
            if self.data is None:
                log.error("live mode but MetaTrader5 is not reachable -- refusing to start")
                return False
            self.broker = self.data
        else:
            self.broker = PaperBroker(balance=10_000.0)
            if self.data is None:
                self.quotes = QuoteFeed(self.kv.base, log=log) if hasattr(self.kv, "base") else None
                log.warning("paper mode without MT5: prices from the dashboard quote feed, "
                            "outcome record from sampled prices (no M1 bars)")
        if self.data is not None:
            self.verify_symbols({x for x in set(USUAL_SYMBOLS) | {str(k).upper() for k in (cfg.get("symbol_map") or {})}
                                 if not (cfg.get("ignore_crypto", True) and is_crypto(x))}, startup=True)
        log.info(f"mode={'PAPER' if self.paper else 'LIVE'}  data={'mt5' if self.data else 'quotes'}  "
                 f"account={self.account_login}")
        return True

    def verify_symbols(self, pairs, startup=False):
        """Broker symbol check (pylego Mt5Broker.verify_symbols, as Vote Atlas /
        Fib Atlas / Motif do). Logs and reports mismatches; never auto-corrects.
        Returns the problem rows for `pairs`."""
        todo = sorted(p for p in pairs if p and p not in self.verified)
        if self.data is None or not todo:
            return [p for p in self.symbol_problems if p["pair"] in pairs]
        self.verified.update(todo)
        try:
            problems = self.data.verify_symbols(todo)
        except Exception as e:
            log.warning(f"symbol verification failed to run: {e}")
            return []
        for p in problems:
            sugg = f" -- closest matches: {', '.join(p['suggestions'])}" if p["suggestions"] else " -- no close match on this account"
            log.error(f"BROKER SYMBOL MISMATCH: {p['pair']} configured as {p['configured']!r} -- not found{sugg}. "
                      f"Fix it in the Symbol map on the bot page.")
        self.symbol_problems = [p for p in self.symbol_problems if p["pair"] not in todo] + problems
        if not problems:
            log.info(f"symbol check OK -- {len(todo)} symbol(s){' at startup' if startup else ''} exist on this account")
        return [p for p in self.symbol_problems if p["pair"] in pairs]

    # ── prices / bars ─────────────────────────────────────────────────────
    def price(self, pair):
        if self.data is not None:
            return self.data.price(pair)
        if self.quotes is not None:
            return self.quotes.price(pair)
        return None

    def bars(self, pair, since):
        if self.data is not None:
            off = self.data.server_offset_sec() or 0
            # Request from well before the post on either clock reading of the
            # timestamp; the resolver ignores everything before the post.
            rows = self.data.session_bars(pair, int(since) - abs(off) - 3600)
            return [{**b, "time": b["time"] - off} for b in rows]
        return [{"time": t, "open": p, "high": p, "low": p, "close": p} for t, p in self.samples.get(pair, [])]

    # ── decisions / alerts ───────────────────────────────────────────────
    def decide(self, o, status, reason=None, **extra):
        sym = o.get("symbol") or ""
        self.decisions.append({"t": int(_now()), "id": o.get("id"), "pair": sym.lower(), "symbol": sym,
                               "side": o.get("side"), "order": o.get("order"), "status": status, "reason": reason,
                               "entry": o.get("entry"), "sl": o.get("sl"), "tp": o.get("tp"), **extra})
        del self.decisions[:-DECISION_LOG_MAX_EVENTS]
        self.dirty["decisions"] = True
        log.info(f"[{status}] {o.get('id')} {o.get('side')} {o.get('symbol')} {reason or ''}")

    def alert(self, text, reply_to=None):
        """Console always; Telegram when this bot's alerts are on AND the ⚙ Alerts
        master switch (ai_alert_cfg.tgMaster.signalCopier) is not off. Returns
        the Telegram message_id (for reply threading) or None."""
        log.info(text.replace("\n", " | "))
        if self.cfg.get("tg_enabled", True) and self.tg_master_on:
            return _tg_send(self.cfg.get("tg_token", ""), str(self.cfg.get("tg_chat_id", "")), text, reply_to=reply_to)
        return None

    def mode_tag(self):
        return " [PAPER]" if self.paper else ""

    # ── message → book → broker + record ──────────────────────────────────
    def on_message(self, msg_id, text, posted: datetime, edited=False, execute=True):
        events = parse_message(text)
        key, sig = str(msg_id), repr(events)
        if edited:
            if key in self.book.seen and self.book.seen[key] != sig and has_trade_events(events):
                self.book.seen[key] = sig
                self.alert(f"✏️ Signal message {msg_id} was EDITED — not auto-applied, check:\n{text}")
                self.dirty["state"] = True
            return
        if key in self.book.seen:
            return
        self.book.seen[key] = sig
        self.dirty["state"] = True
        self.apply(self.book.apply(events, msg_id, posted.astimezone(timezone.utc)), execute)

    def apply(self, transitions, execute=True):
        for action, o, detail in transitions:
            if action == "warn":
                if execute:                      # history replays log, they don't alert
                    self.alert(f"⚠️ {detail}")
                else:
                    log.info(f"(history) {detail}")
                continue
            self.record(action, o)
            if execute:
                self.execute(action, o, detail)
        if transitions:
            self.dirty["state"] = True

    # outcome record ---------------------------------------------------------
    def ignored(self, symbol) -> bool:
        return bool(self.cfg.get("ignore_crypto", True)) and is_crypto(symbol)

    def record(self, action, o):
        if not getattr(self, "recording", True):
            return
        if self.ignored(o.get("symbol")):
            return
        rid = o["id"]
        if action == "place":
            if rid in self.signals:
                return
            fresh = _now() - _ts(o["posted_at"]) < 120
            self.signals[rid] = {
                "id": rid, "symbol": o["symbol"], "side": o["side"], "order": o["order"], "entry": o["entry"],
                "sl": o.get("sl"), "tp": o.get("tp"), "style": o.get("style") or "single",
                "posted_ts": _ts(o["posted_at"]), "cancel_ts": _ts(o.get("cancel_at_utc")),
                "close_ts": _ts(o.get("close_at_utc")), "close_reason": "close-at" if o.get("close_at_utc") else None,
                "recv_px": (self.price(o["symbol"]) if fresh and o["order"] == "market" else None),
                "spread": spread_for(o["symbol"], self.data), "final": False, "out": None, "row": None,
            }
        else:
            r = self.signals.get(rid)
            if not r or r["final"]:
                return
            when = _ts(o.get("ended_at")) or _now()
            if action == "cancel" and o["status"] == "cancelled":
                r["cancel_ts"] = min(filter(None, [r.get("cancel_ts"), when]))
            elif action == "close":
                if not r.get("close_ts") or when < r["close_ts"]:
                    r["close_ts"], r["close_reason"] = when, o.get("end_reason") or "close"
        self.dirty["signals"] = True

    def resolve_open(self):
        self.life["last_resolve_at"] = int(_now())
        self.life["resolves"] += 1
        for r in self.signals.values():
            # crypto stored before the flag existed: hidden from Outcomes/export, kept in KV
            ign = "crypto" if self.ignored(r["symbol"]) else None
            if r.get("ignored") != ign:
                r["ignored"] = ign
                self.dirty["signals"] = True
            if r["final"] or ign:
                continue
            out = resolve(r, self.bars(r["symbol"], r["posted_ts"]), spread=r.get("spread") or 0.0, now=_now())
            r["out"] = out
            r["row"] = template_row(r, out, self.cfg.get("record_risk_pct", 1.0))
            r["final"] = out["state"] in ("done", "unfilled")
            self.dirty["signals"] = True

    # execution ---------------------------------------------------------------
    def live_execs(self):
        return [e for e in self.execs.values() if e["status"] in LIVE_EXEC]

    def execute(self, action, o, detail):
        cfg = self.cfg
        if action == "place":
            return self._place(o)
        e = self.execs.get(o["id"])
        if not e or e["status"] not in LIVE_EXEC:
            return
        filled = bool(self.broker.positions_with_tag(e["tag"]))
        if action == "cancel":
            if e["status"] == "pending" and filled:
                e["status"] = "open"
                self.decide(o, "kept", f"{detail} — but our order already filled; position kept, "
                                       f"exits on SL/TP/close-at/close message")
                self.alert(f"ℹ️ {o['side']} {o['symbol']}: channel cancel ({detail}) but YOUR order filled — kept open")
                return
            if e["status"] == "pending":
                self.broker.cancel_pending(e["ticket"])
                e["status"] = "cancelled"
                self.decide(o, "cancelled", detail, ticket=e["ticket"])
                self.alert(f"🚫 CANCELLED {o['side']} {o['symbol']} @ {o['entry']:g} — {detail}")
        elif action == "close":
            self._close(e, o, detail)

    def _close(self, e, o, detail):
        if e["status"] == "pending" and not self.broker.positions_with_tag(e["tag"]):
            self.broker.cancel_pending(e["ticket"])
            e["status"] = "cancelled"
            self.decide(o, "cancelled", f"{detail} (never filled)", ticket=e["ticket"])
            return
        for t in self.broker.positions_with_tag(e["tag"]):
            self.broker.stop(t, o["symbol"], False, reason=detail or "close", comment_prefix="SC close")
        e["status"] = "closed"
        self.decide(o, "closed", detail, ticket=e["ticket"])
        self.alert(f"✅ CLOSED {o['side']} {o['symbol']} @ {o['entry']:g} — {detail}")

    def _skip(self, o, why, status="skipped"):
        self.execs[o["id"]] = {"id": o["id"], "status": "skipped", "reason": why}
        self.decide(o, status, why)
        self.alert(f"⏭ SKIPPED {describe(o)} — {why}{self.mode_tag()}")

    def _place(self, o):
        cfg = self.cfg
        if o["id"] in self.execs:
            return
        style = o.get("style") or "single"
        if cfg.get("kill_switch"):
            return self._skip(o, "kill switch on")
        if not cfg.get(f"copy_{style}", True):
            return self._skip(o, f"{style} signals switched off")
        if self.ignored(o["symbol"]):
            self.execs[o["id"]] = {"id": o["id"], "status": "skipped", "reason": "crypto ignored"}
            return self.decide(o, "skipped", "crypto ignored (Ignore crypto is on)")     # logged, no alert
        if o["symbol"].upper() in {s.upper() for s in cfg.get("skip_symbols") or []}:
            return self._skip(o, "symbol on skip list")
        if o.get("sl") is None:
            return self._skip(o, "no stop loss in the signal")
        if len(self.live_execs()) >= int(cfg.get("max_open", 12)):
            return self._skip(o, f"max_open {cfg.get('max_open')} reached")
        bal = self.broker.account_balance() or 0.0
        block = self.guard.block_reason(bal, o["symbol"].lower()) if bal else None
        log_block_transition(log, self.guard_state, o["symbol"].lower(), block)
        if block:
            return self._skip(o, f"risk_guard: {block_category(block)}", status="pair_blocked")
        bad = self.verify_symbols({o["symbol"].upper()})
        if bad:
            sugg = ", ".join(bad[0]["suggestions"]) or "none close"
            return self._skip(o, f"{bad[0]['configured']} is not a symbol on this account (closest: {sugg}) "
                                 f"— set it in the Symbol map")
        age = _now() - _ts(o["posted_at"])
        if o["order"] == "market" and age > cfg.get("max_signal_age_secs", 300):
            return self._skip(o, f"signal is {int(age)}s old (max {cfg.get('max_signal_age_secs')}s)")

        pair, d = o["symbol"], (1 if o["side"] == "BUY" else -1)
        px = self.price(pair)
        if px is None:
            return self._skip(o, f"no price for {pair} ({self.bsym(pair)}) — check the symbol map")
        if isinstance(self.broker, PaperBroker):
            self.broker.set_price(pair, px)
        risk_dist = abs(o["entry"] - o["sl"])
        if not risk_dist:
            return self._skip(o, "stop equals entry")
        if (px - o["sl"]) * d <= 0:
            return self._skip(o, f"price {px:g} is already beyond the stop {o['sl']:g}")
        spread = spread_for(pair, self.data or self.broker)
        if spread > cfg.get("max_spread_r", 0.2) * risk_dist:
            return self._skip(o, f"spread {spread:g} > {cfg.get('max_spread_r')}R of the {risk_dist:g} stop")

        as_market = o["order"] == "market"
        if as_market:
            drift = (px - o["entry"]) * d / risk_dist
            if drift > cfg.get("max_entry_drift_r", 0.25):
                return self._skip(o, f"price {px:g} is {drift:.2f}R worse than his entry {o['entry']:g}")
        lots, why = self._size(pair, abs(px - o["sl"]) if as_market else risk_dist)
        if not lots:
            return self._skip(o, why)

        tag = o["id"].replace(":", "-")
        comment = f"SC[{tag}]"
        direction = "LONG" if d > 0 else "SHORT"
        max_spread_pips = cfg.get("max_spread_r", 0.2) * risk_dist / self.pip(pair)
        ticket, kind = None, "market"
        if not as_market:
            kind = "pending"
            ticket = self.broker.place_pending(pair, direction, o["order"], o["entry"], o["sl"], o.get("tp"),
                                               lots, False, comment=comment, dedupe_tag=tag)
            if ticket is None and (self.broker.last_reject_reason or "").startswith("price_through"):
                if cfg.get("limit_through") == "market" and o["order"] == "limit":
                    kind = "market"
                    self.decide(o, "note", f"limit already traded through ({self.broker.last_reject_reason}) "
                                           f"— taking the better price at market")
                else:
                    return self._skip(o, f"limit already traded through ({self.broker.last_reject_reason})")
        if kind == "market":
            ticket = self.broker.enter(pair, direction, o["sl"], o.get("tp") or 0, lots, max_spread_pips, False,
                                       comment=comment, dedupe_tag=tag)
        if ticket is None:
            reason = self.broker.last_reject_reason or "rejected"
            self.execs[o["id"]] = {"id": o["id"], "status": "rejected", "reason": reason}
            r = self.retries.get(o["id"], {"n": 0})
            retry = reason.startswith(RETRYABLE) and r["n"] < int(cfg.get("retry_rejects", 3))
            if retry:
                self.retries[o["id"]] = {"n": r["n"] + 1, "at": _now() + REJECT_RETRY_SECS}
            else:
                self.retries.pop(o["id"], None)
            self.decide(o, "rejected", reason + (f" — retry {r['n'] + 1} in {REJECT_RETRY_SECS}s" if retry else ""),
                        lots=lots)
            if r["n"] == 0:                      # alert once per signal, not once per retry
                self.alert(f"❌ REJECTED {describe(o)} — {reason}" + (" (will retry)" if retry else "") + self.mode_tag())
            return
        self.retries.pop(o["id"], None)
        self.guard.record_trade(o["symbol"].lower())
        self.execs[o["id"]] = {"id": o["id"], "tag": tag, "symbol": pair, "side": o["side"], "ticket": ticket,
                               "status": "pending" if kind == "pending" else "open", "lots": lots,
                               "close_ts": _ts(o.get("close_at_utc")), "placed_at": int(_now())}
        self.decide(o, "entered" if kind == "market" else "pending", None, lots=lots, ticket=ticket)
        icon = "🟢" if d > 0 else "🔴"
        mid = self.alert(f"{icon} {'ENTERED' if kind == 'market' else 'ORDER PLACED'} {describe(o)} — {lots} lots"
                         f"{self.mode_tag()}")
        if mid:
            self.tg_entry_msgid[str(ticket)] = mid

    def _size(self, pair, stop_dist):
        cfg = self.cfg
        bal = self.broker.account_balance() or 0
        risk_money = bal * cfg.get("risk_pct", 0.5) / 100
        max_lot = float(cfg.get("max_lot", 5.0))
        if self.data is not None:
            info = self.data.mt5.symbol_info(self.bsym(pair))
            tv, ts = getattr(info, "trade_tick_value", 0), getattr(info, "trade_tick_size", 0)
            if not (tv and ts):
                return 0, f"no tick value for {self.bsym(pair)}"
            per_lot = stop_dist / ts * tv
            lots = min(risk_money / per_lot, max_lot)
            vmin = getattr(info, "volume_min", 0.01) or 0.01
            if lots < vmin:
                if vmin * per_lot > 1.5 * risk_money:
                    return 0, (f"min lot {vmin} risks {vmin * per_lot:.2f} > 1.5× the "
                               f"{risk_money:.2f} target — account too small for this stop")
                lots = vmin
            return round(lots, 2), None
        try:
            pip, pv = I.pip_size(pair), PV.point_value(pair)
        except Exception:
            pip, pv = 0.0001, 10.0
        lots = position_size(bal, cfg.get("risk_pct", 0.5), stop_dist, pip=pip, pip_value=pv, max_lot=max_lot)
        return round(min(max(lots, 0.01), max_lot), 2), None

    def sync(self):
        """Follow fills and broker-side exits; apply our own close-at for a
        limit the book expired but that filled."""
        now = _now()
        pend = {p["ticket"] for p in self.broker.pending_orders()}
        for e in self.live_execs():
            o = self.book.orders.get(e["id"], {"id": e["id"], "symbol": e["symbol"], "side": e["side"]})
            filled = bool(self.broker.positions_with_tag(e["tag"]))
            if e["status"] == "pending":
                if filled:
                    e["status"] = "open"
                    self.decide(o, "filled", None, ticket=e["ticket"])
                    self.alert(f"🎯 FILLED {o.get('side')} {o.get('symbol')} @ {o.get('entry', 0):g}")
                elif e["ticket"] not in pend:
                    e["status"] = "cancelled"
                    self.decide(o, "cancelled", "order no longer on the broker", ticket=e["ticket"])
            elif e["status"] == "open":
                if not filled:
                    e["status"] = "closed"
                    self.decide(o, "closed", "closed at the broker (SL/TP/manual)", ticket=e["ticket"])
                elif e.get("close_ts") and now >= e["close_ts"]:
                    self._close(e, o, "close-at time")
            self.dirty["state"] = True

    # ── persistence / status ─────────────────────────────────────────────
    def flush(self, force=False):
        kv = self.kv
        try:
            if self.dirty["state"] or force:
                kv.put_json(f"{K}_state", {"book": self.book.to_dict(), "execs": self.execs, "retries": self.retries,
                                           "tg_entry_msgid": self.tg_entry_msgid,
                                           "tg_closed_alerted": sorted(self.tg_closed_alerted, key=str)[-2000:]})
                self.dirty["state"] = False
            if self.dirty["signals"] or force:
                kv.put_json(f"{K}_signals", {"records": sorted(self.signals.values(), key=lambda r: r["posted_ts"]),
                                             "updated_at": int(_now())})
                self.dirty["signals"] = False
            if self.dirty["decisions"]:
                kv.put_json(f"{K}_decision_log", {"events": self.decisions})
                self.dirty["decisions"] = False
        except Exception as e:
            log.warning(f"KV flush failed: {e}")

    def status(self):
        b = self.broker
        bal = b.account_balance() if b else None
        live_orders = self.book.live()
        return {
            "running": True, "mode": "paper" if self.paper else "live",
            "kill_switch": bool(self.cfg.get("kill_switch")),
            "balance": round(bal, 2) if bal is not None else None,
            "account_login": self.account_login, "data_source": "mt5" if self.data else "quotes",
            "telegram": self.tg, "life": self.life,
            "mt5_positions": b.serialize_open_positions() if b else [],
            "today_closed_trades": b.serialize_closed_trades() if b else [],
            "pending_orders": b.pending_orders() if b else [],
            "book": [{**{k: o.get(k) for k in ("id", "symbol", "side", "order", "entry", "sl", "tp", "style",
                                                "status", "cancel_at", "close_at", "posted_at")},
                      "exec": (self.execs.get(o["id"]) or {}).get("status")} for o in live_orders],
            "signals_open": sum(1 for r in self.signals.values() if not r["final"]),
            "signals_total": len(self.signals),
            "risk_guard": self.guard.snapshot(bal),
            "risk_guard_enabled": bool(self.cfg.get("risk_guard_enabled", True)),
            "max_open": int(self.cfg.get("max_open", 12)), "open_used": len(self.live_execs()),
            "risk_pct": self.cfg.get("risk_pct"),
            "symbol_problems": self.symbol_problems,
            "tg_master_on": self.tg_master_on,
            "retrying": len(self.retries),
            "pushed_at": int(_now()),
        }

    def refresh_life(self):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        counts: dict[str, int] = {}
        for ev in reversed(self.decisions):
            if datetime.fromtimestamp(ev["t"], tz=timezone.utc).strftime("%Y-%m-%d") != today:
                break
            counts[ev["status"]] = counts.get(ev["status"], 0) + 1
        self.life["decisions_today"] = counts
        self.life["uptime_s"] = int(_now() - self._boot)

    def push_status(self):
        try:
            self.kv.put_status(f"{K}_status", self.status())
        except Exception as e:
            log.warning(f"status push failed: {e}")

    def tick(self):
        """One poll: prices, paper fills, timed rules, sync, close alerts, retries."""
        self.life["ticks"] += 1
        self.life["last_tick_at"] = int(_now())
        pairs = {o["symbol"] for o in self.book.live()} | {e["symbol"] for e in self.live_execs()} | \
                {r["symbol"] for r in self.signals.values() if not r["final"]}
        for p in pairs:
            px = self.price(p)
            if px is None:
                continue
            if isinstance(self.broker, PaperBroker):
                self.broker.set_price(p, px)
            if self.data is None:
                self.samples.setdefault(p, []).append((int(_now()), px))
                del self.samples[p][:-50_000]
        if isinstance(self.broker, PaperBroker):
            self.broker.check_barriers()
        bal = self.broker.account_balance()
        if bal:
            self.guard.update_balance(bal)
        self.apply(self.book.tick(datetime.now(timezone.utc)))
        self.sync()
        self.close_alerts()
        self.retry_rejects()

    def close_alerts(self):
        """One reply-threaded alert per closed position (SL/TP/manual/ours).
        serialize_closed_trades re-returns today's closes every tick, so dedupe
        on position_id (persisted) — the Vote Atlas / Motif pattern."""
        for c in self.broker.serialize_closed_trades():
            pid = c.get("position_id") or c.get("ticket")
            if pid is None or str(pid) in self.tg_closed_alerted:
                continue
            self.tg_closed_alerted.add(str(pid))
            self.alert(_fmt_close_alert(c, self.mode_tag()), reply_to=self.tg_entry_msgid.pop(str(pid), None))
            self.dirty["state"] = True

    def retry_rejects(self):
        now = _now()
        for rid, r in list(self.retries.items()):
            o = self.book.orders.get(rid)
            if not o or o["status"] not in ("open", "working") or (self.execs.get(rid) or {}).get("status") != "rejected":
                self.retries.pop(rid, None)
                continue
            if now >= r["at"]:
                self.execs.pop(rid, None)
                self._place(o)                   # every entry check runs again (age, drift, spread, guard…)
                self.dirty["state"] = True


# ── Telegram ─────────────────────────────────────────────────────────────────
async def telegram_login(cp: Copier):
    try:
        from telethon import TelegramClient
        from telethon.errors import (PhoneCodeExpiredError, PhoneCodeInvalidError,
                                     SessionPasswordNeededError, PasswordHashInvalidError)
    except ImportError:
        cp.tg.update(state="error", detail="telethon not installed: pip install -r SignalCopier/requirements.txt")
        cp.push_status()
        raise SystemExit(cp.tg["detail"])
    kv = cp.kv
    while True:
        tgc = kv.get_json(f"{K}_tg_credentials") or {}
        if tgc.get("api_id") and tgc.get("api_hash") and tgc.get("phone"):
            break
        cp.tg.update(state="no_credentials", detail="Save Telegram api_id, api_hash and phone on the bot page")
        cp.push_status()
        log.warning(cp.tg["detail"])
        await asyncio.sleep(30)

    client = TelegramClient(SESSION, int(tgc["api_id"]), tgc["api_hash"])
    await client.connect()
    if await client.is_user_authorized():
        return client

    phone = str(tgc["phone"]).strip()
    sent = await client.send_code_request(phone)
    asked = _now()
    need = "code"
    cp.tg.update(state="need_code", detail=f"Telegram sent a login code to the app for …{phone[-3:]}. "
                                           f"Enter it on the bot page (Telegram login card).")
    cp.push_status()
    last_beat = _now()
    while True:
        await asyncio.sleep(4)
        if _now() - last_beat >= cp.cfg.get("status_secs", 30):   # keep the page's liveness dot honest
            cp.refresh_life()
            cp.push_status()
            last_beat = _now()
        req = kv.get_json(f"{K}_tg_login") or {}
        if (req.get("t") or 0) / 1000 < asked - 5:
            continue
        try:
            if need == "code" and req.get("code"):
                await client.sign_in(phone=phone, code=str(req["code"]).strip(), phone_code_hash=sent.phone_code_hash)
                break
            if need == "password" and req.get("password"):
                await client.sign_in(password=req["password"])
                break
        except SessionPasswordNeededError:
            need, asked = "password", _now()
            cp.tg.update(state="need_password", detail="Your account has two-step verification: enter your "
                                                       "Telegram cloud password on the bot page.")
        except (PhoneCodeInvalidError, PasswordHashInvalidError):
            asked = _now()
            cp.tg.update(detail=f"That {need} was wrong — enter it again.")
        except PhoneCodeExpiredError:
            sent, asked = await client.send_code_request(phone), _now()
            cp.tg.update(state="need_code", detail="The code expired — a new one was sent. Enter the new code.")
        kv.put_json(f"{K}_tg_login", {"t": 0})
        cp.push_status()
    kv.put_json(f"{K}_tg_login", {"t": 0})       # never leave a code or password in KV
    log.info("Telegram login complete — session saved locally")
    return client


def make_filter(cfg):
    from copier import sender_label, topic_of
    topic = cfg.get("tg_topic")
    senders = {s.strip().lower() for s in str(cfg.get("tg_senders") or "").split(",") if s.strip()}

    def ok(msg):
        if topic and topic_of(msg) != int(topic):
            return False
        if senders:
            name, sid = sender_label(msg)
            return name.lower() in senders or sid in senders
        return True
    return ok


async def run(base_url, force_live, backfill_since=None, parse_only=False):
    kv = KvClient(base_url)
    cfg = _deep_merge(DEFAULT_CFG, kv.get_json(f"{K}_config") or {})
    if backfill_since:
        cfg["paper_mode"] = True        # a replay never trades, whatever the dashboard toggle says
    cp = Copier(kv, cfg, force_live)
    if not cp.connect():
        return
    try:
        cp.tg_master_on = (kv.get_json("ai_alert_cfg") or {}).get("tgMaster", {}).get("signalCopier", None) is not False
    except Exception:
        pass
    client = await telegram_login(cp)
    chat = int(cfg.get("tg_chat") or DEFAULT_CHAT)
    entity = await client.get_entity(chat)
    cp.tg.update(state="connected", detail=None, chat=getattr(entity, "title", str(chat)), topic=cfg.get("tg_topic"))
    ok = make_filter(cfg)

    if backfill_since:
        await backfill(cp, client, chat, ok, backfill_since, parse_only)
        await client.disconnect()
        return

    from telethon import events as tev

    async def on_new(ev):
        await ev.message.get_sender()
        if not ok(ev.message):
            return
        cp.tg["last_msg_at"], cp.tg["msgs"] = int(_now()), cp.tg["msgs"] + 1
        cp.on_message(ev.message.id, ev.message.message or "", ev.message.date)
        cp.flush()

    async def on_edit(ev):
        await ev.message.get_sender()
        if ok(ev.message):
            cp.on_message(ev.message.id, ev.message.message or "", ev.message.date, edited=True)

    async def on_delete(ev):
        hit = [i for i in ev.deleted_ids if str(i) in cp.book.seen]
        if hit:
            cp.alert(f"🗑 Signal message(s) {hit} deleted in the channel — check the book")

    client.add_event_handler(on_new, tev.NewMessage(chats=chat))
    client.add_event_handler(on_edit, tev.MessageEdited(chats=chat))
    client.add_event_handler(on_delete, tev.MessageDeleted(chats=chat))
    cp.alert(f"📡 Signal Copier listening to \"{cp.tg['chat']}\" (topic {cfg.get('tg_topic') or 'all'}) — "
             f"{'PAPER' if cp.paper else 'LIVE'}, risk {cfg['risk_pct']}%/signal")

    last_status = last_resolve = 0.0
    while True:
        try:
            cp.tick()
            now = _now()
            if now - last_resolve >= cp.cfg.get("resolve_secs", 60):
                cp.resolve_open()
                last_resolve = now
            if now - last_status >= cp.cfg.get("status_secs", 30):
                try:
                    fresh = kv.get_json(f"{K}_config") or {}
                    cp.cfg = _deep_merge(DEFAULT_CFG, fresh)
                    if force_live:
                        cp.cfg["paper_mode"] = False
                    cp.guard.sync_cfg(cp.cfg)
                except Exception as e:
                    log.warning(f"config fetch failed: {e} -- keeping the last config")
                try:
                    master = kv.get_json("ai_alert_cfg") or {}
                    cp.tg_master_on = master.get("tgMaster", {}).get("signalCopier", None) is not False
                except Exception as e:
                    log.warning(f"ai_alert_cfg fetch failed: {e} (Telegram master switch check skipped this cycle)")
                cp.refresh_life()
                if bool(cp.cfg.get("paper_mode", True)) != cp.paper:
                    log.warning("paper/live toggle changed on the dashboard — restart the bot to switch modes")
                cp.push_status()
                last_status = now
            cp.flush()
        except Exception as e:
            log.exception(f"loop error: {e}")
        await asyncio.sleep(cp.cfg.get("poll_secs", 5))


def replay_history(cp: Copier, messages, record=True):
    """Replay past messages [(msg_id, text, posted_utc), …] oldest first through a
    fresh book, with no orders. With `record`, signals go into the outcome record;
    either way returns the parse report: what was understood, what wasn't."""
    book, hold = Book(), cp.book
    cp.book, cp.recording = book, record
    rep = {"messages": 0, "with_instructions": 0, "opens": 0, "cancels": 0, "closes": 0, "ignored_crypto": 0,
           "by_symbol": {}, "by_style": {}, "unparsed": [], "unmatched": []}
    first = last = None
    try:
        for mid, text, posted in messages:
            posted = posted.astimezone(timezone.utc)
            first, last = first or posted, posted
            rep["messages"] += 1
            cp.apply(book.tick(posted), execute=False)
            events = parse_message(text or "")
            book.seen[str(mid)] = repr(events)
            if has_trade_events(events):
                rep["with_instructions"] += 1
            for e in events:
                k = e["kind"]
                if k == "open" and cp.ignored(e["symbol"]):
                    rep["ignored_crypto"] += 1     # parsed fine, but not counted, scored or recorded
                elif k == "open":
                    rep["opens"] += 1
                    rep["by_symbol"][e["symbol"]] = rep["by_symbol"].get(e["symbol"], 0) + 1
                    st = e.get("style") or "single"
                    rep["by_style"][st] = rep["by_style"].get(st, 0) + 1
                elif k in ("cancel", "close") and not cp.ignored(e["symbol"]):
                    rep[k + "s"] += 1
                elif k == "review":
                    rep["unparsed"].append({"msg_id": mid, "t": int(posted.timestamp()), "text": e["text"][:600]})
            for action, o, detail in book.apply(events, mid, posted):
                if action == "warn" and "no matching live order" in (detail or "") and not cp.ignored(detail.split(" @ ")[0].split()[-1]):
                    rep["unmatched"].append({"msg_id": mid, "t": int(posted.timestamp()), "detail": detail})
                cp.apply([(action, o, detail)], execute=False)
        cp.apply(book.tick(datetime.now(timezone.utc)), execute=False)
    finally:
        cp.book, cp.recording = hold, True
    rep["unparsed"], rep["unmatched"] = rep["unparsed"][-200:], rep["unmatched"][-200:]
    rep["from_ts"] = int(first.timestamp()) if first else None
    rep["to_ts"] = int(last.timestamp()) if last else None
    return rep


async def backfill(cp: Copier, client, chat, ok, since: str, parse_only=False):
    """Replay the topic's history: always a parse report (signal_copier_backfill_report);
    unless `parse_only`, also the outcome record scored on MT5 M1 bars. No orders."""
    if not parse_only and cp.data is None:
        raise SystemExit("outcomes need the MT5 terminal for M1 bars — start MT5, or add --parse-only "
                         "to just test the parser")
    start = datetime.strptime(since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    topic = cp.cfg.get("tg_topic")
    kw = {"reply_to": int(topic)} if topic and int(topic) != 1 else {}
    msgs = []
    async for msg in client.iter_messages(chat, reverse=True, offset_date=start, **kw):
        if ok(msg):
            msgs.append((msg.id, msg.message or "", msg.date))
    live_ids = {rid for rid, r in cp.signals.items() if r.get("recv_px") is not None}
    before = set(cp.signals)
    rep = replay_history(cp, msgs, record=not parse_only)
    rep.update({"ran_at": int(_now()), "since": since, "mode": "parse only" if parse_only else "parse + outcomes",
                "chat": cp.tg.get("chat"), "topic": topic, "senders": cp.cfg.get("tg_senders") or None})
    if not parse_only:
        for rid, r in cp.signals.items():
            if rid not in live_ids:
                r["recv_px"] = None        # history: fill at the first bar after the post
                r["final"] = False
        cp.resolve_open()
        rep["signals_recorded"] = len(set(cp.signals) - before)
        rep["with_template_row"] = sum(1 for r in cp.signals.values() if r.get("row"))
        cp.flush(force=True)
    try:
        cp.kv.put_json(f"{K}_backfill_report", rep)
    except Exception as e:
        log.warning(f"could not save the parse report: {e}")
    log.info(f"backfill ({rep['mode']}): {rep['messages']} messages, {rep['opens']} signals, "
             f"{rep['cancels']} cancels, {rep['closes']} closes, {len(rep['unparsed'])} unparsed, "
             f"{len(rep['unmatched'])} unmatched — see the Signal Copier tab")
    for u in rep["unparsed"][-20:]:
        log.warning(f"UNPARSED msg {u['msg_id']}: {u['text'][:200]!r}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("DASHBOARD_URL", "http://localhost:3000"))
    ap.add_argument("--live", action="store_true", help="force live (overrides the dashboard paper toggle)")
    ap.add_argument("--backfill-since", metavar="YYYY-MM-DD",
                    help="replay channel history from this date, then exit (places no orders)")
    ap.add_argument("--backfill-days", type=int, metavar="N", help="same, for the last N days")
    ap.add_argument("--parse-only", action="store_true",
                    help="with a backfill: only test the parser (no MT5 needed, outcome record untouched)")
    a = ap.parse_args()
    since = a.backfill_since
    if a.backfill_days:
        since = (datetime.now(timezone.utc) - timedelta(days=a.backfill_days)).strftime("%Y-%m-%d")
    if a.parse_only and not since:
        ap.error("--parse-only needs --backfill-days or --backfill-since")
    asyncio.run(run(a.url, a.live and not since, since, a.parse_only))


if __name__ == "__main__":
    main()
