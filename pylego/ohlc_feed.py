"""Dashboard KV OHLC session-bar feed for paper mode (Category-B brick).

Paper mode has no bar history: ``PaperBroker.session_bars`` only returns what a
test fed it, so a paper bot could never build fresh Asia/Monday ladders (the
QuoteFeed only covers live prices/trailing). The dashboard already caches OANDA
M5 candles in KV under ``ohlc5m_{SYMKEY}_{sessionDay}`` (written by the
dashboard's ``loadCached`` when a pair is loaded — see js/main.js /
js/utils.js; SYMKEY is the dashboard symbol without the slash, e.g. ``EURUSD``,
``XAUUSD``, ``SPX500_USD``; sessionDay is the London session day, before 06:00
London → yesterday). This brick reads that key via ``GET /api/kv/get`` and
converts the payload (``{values: [{datetime, open, high, low, close}]}``,
newest-first, datetime = London-local string, OHLC = strings) to the broker bar
shape ``{time, open, high, low, close}`` — epoch seconds, floats, oldest-first —
the exact shape ``Mt5Broker.session_bars`` returns.

Same discipline as ``pylego.quotes.QuoteFeed``: per-pair fetch cache
(``min_interval``), once-per-state-change logging (never per tick), injected
http + clock so it is offline-testable (``ohlc_feed_test.py``).
``window_bars()`` additionally REFUSES to return a window the payload does not
fully cover — a partial window would build a ladder off a wrong range low/high,
which is worse than no ladder — it returns None and logs what is missing; it
never fakes bars.

Known coverage limits (documented, not worked around):
  * the payload is the newest ~1500 M5 candles (~5 trading days), so a Monday
    window more than that far back is reported missing;
  * the KV key only EXISTS for pairs the dashboard tracks (js/config.js PAIRS)
    *and* only after the dashboard has actually loaded that pair this session
    day — universe members outside the dashboard list (e.g. nzdjpy, euraud)
    have no feed and are reported missing.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pylego.instruments import instrument

_LONDON = ZoneInfo("Europe/London")


def _utc(epoch: float) -> datetime:
    """Aware-UTC datetime for log formatting (utcfromtimestamp is deprecated)."""
    return datetime.fromtimestamp(int(epoch), tz=timezone.utc)


def london_session_day(now_epoch: float) -> str:
    """The dashboard's session-day key part (js/utils.js londonSessionDay):
    London calendar date, except before 06:00 London it is still YESTERDAY's
    session day."""
    dt = datetime.fromtimestamp(now_epoch, tz=_LONDON)
    if dt.hour < 6:
        dt -= timedelta(days=1)
    return dt.strftime("%Y-%m-%d")


def parse_dashboard_values(values) -> list:
    """Dashboard OHLC payload ``values`` → broker bars: London-local datetime
    string → epoch seconds, string OHLC → floats, newest-first → oldest-first.
    A row that fails to parse is dropped (never a fabricated bar). Shared by
    KvOhlcFeed and any tool reading /api/oanda_ohlc5m-shaped payloads
    (scripts/check_mt5_session_window.py)."""
    out = []
    for v in values or []:
        try:
            naive = datetime.strptime(str(v["datetime"]), "%Y-%m-%d %H:%M:%S")
            t = int(naive.replace(tzinfo=_LONDON).timestamp())
            out.append({"time": t, "open": float(v["open"]), "high": float(v["high"]),
                        "low": float(v["low"]), "close": float(v["close"])})
        except Exception:
            continue
    out.sort(key=lambda b: b["time"])
    return out


def dash_sym_key(pair: str) -> str:
    """Dashboard OHLC-KV symbol key for a canonical pair: the registry display
    symbol without the slash (EUR/USD → EURUSD, gold → XAUUSD, spx500 →
    SPX500_USD — the registry display matches js/config.js PAIRS exactly).
    Unknown symbols pass through upper-cased."""
    try:
        return instrument(pair)["display"].replace("/", "")
    except Exception:
        return str(pair).upper().replace("/", "")


class KvOhlcFeed:
    def __init__(self, base_url: str, http=None, timeout: int = 15,
                 min_interval: float = 120.0,
                 log: logging.Logger | None = None, now=time.time):
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self.min_interval = float(min_interval)
        self.log = log or logging.getLogger("pylego.ohlc_feed")
        self._now = now
        if http is None:
            import requests  # lazy — keeps the brick importable without the dep in tests
            http = requests
        self.http = http
        self._cache: dict[str, tuple[list | None, float]] = {}  # pair -> (bars, fetched_at)
        self._last_try: dict[str, float] = {}                   # pair -> last fetch attempt
        self._state: dict[str, str | None] = {}                 # pair -> last logged reason

    def _fetch(self, pair: str) -> list | None:
        """One KV read of today's ohlc5m payload for ``pair`` → parsed bars, or
        None (missing key / bad payload / transport error)."""
        key = f"ohlc5m_{dash_sym_key(pair)}_{london_session_day(self._now())}"
        try:
            r = self.http.get(f"{self.base}/api/kv/get", params={"key": key},
                              timeout=self.timeout)
            if getattr(r, "status_code", 200) == 404:
                return None
            r.raise_for_status()
            body = r.json()
            if not isinstance(body, dict) or body.get("miss"):
                return None
            data = body.get("data") or {}
            bars = parse_dashboard_values(data.get("values"))
            return bars or None
        except Exception:
            return None

    def _log_state(self, pair: str, reason: str | None) -> None:
        """Fail-loud ONCE: log only when a pair's missing-reason changes (or it
        recovers), never per tick — the QuoteFeed convention."""
        if self._state.get(pair) == reason:
            return
        self._state[pair] = reason
        if reason is None:
            self.log.info(f"ohlc feed {pair}: session bars available")
        else:
            self.log.warning(f"ohlc feed {pair}: {reason}")

    # ── public surface ────────────────────────────────────────────────────────
    def bars(self, pair: str) -> list | None:
        """Full parsed payload for ``pair`` (oldest-first broker bars), or None.
        Never fetches the same pair more often than ``min_interval``."""
        now = self._now()
        cached = self._cache.get(pair)
        if cached is not None and now - cached[1] < self.min_interval:
            return cached[0]
        if now - self._last_try.get(pair, -1e18) >= self.min_interval:
            self._last_try[pair] = now
            bars = self._fetch(pair)
            self._cache[pair] = (bars, now)
            return bars
        return cached[0] if cached is not None else None

    def window_bars(self, pair: str, start_epoch: int, secs: int,
                    step: int = 300) -> list | None:
        """Bars in [start_epoch, start_epoch+secs), ONLY if the payload fully
        covers the window (reaches back to its open and through its close ±2
        bar-steps of slack for feed lag / venue breaks). Partial coverage →
        None + a once-per-state-change log naming what is missing — a ladder
        must never be built from a truncated range window."""
        allb = self.bars(pair)
        if not allb:
            self._log_state(pair, "no ohlc5m payload in dashboard KV — pair not on the "
                                  "dashboard pair list, or not loaded there this session day")
            return None
        end = int(start_epoch) + int(secs)
        slack = 2 * step
        if allb[0]["time"] > start_epoch + slack:
            self._log_state(pair, f"payload starts {_utc(allb[0]['time']):%Y-%m-%d %H:%M}Z, "
                                  f"after the window open {_utc(start_epoch):%Y-%m-%d %H:%M}Z "
                                  f"— not enough history for this ladder (M5 payload ≈5 days)")
            return None
        wb = [b for b in allb if start_epoch <= b["time"] < end]
        if not wb:
            self._log_state(pair, f"no bars inside the window "
                                  f"{_utc(start_epoch):%Y-%m-%d %H:%M}Z +{secs // 3600}h")
            return None
        if wb[-1]["time"] < end - slack and allb[-1]["time"] < end - slack:
            self._log_state(pair, f"window {_utc(start_epoch):%Y-%m-%d %H:%M}Z "
                                  f"+{secs // 3600}h not fully covered yet (payload ends "
                                  f"{_utc(allb[-1]['time']):%Y-%m-%d %H:%M}Z)")
            return None
        self._log_state(pair, None)
        return wb
