#!/usr/bin/env python3
"""
Dynamic Anchor Paper Trading Bot

Paper-trades the dynamic-anchor strategy (from vol backtest) against
live OANDA price data without placing real orders.

Usage:
  python dyn_anchor_bot.py --pair EUR_USD
  python dyn_anchor_bot.py --pair EUR_USD --regime bullbear --dir counter
  python dyn_anchor_bot.py --pair GBP_USD --env practice --poll 60

Arguments:
  --pair       OANDA instrument (default: EUR_USD)
  --regime     all | bullbear | bull | bear (default: bullbear)
  --dir        both | counter (default: counter)
  --env        live | practice (default: from OANDA_ENV env var, fallback live)
  --slope      EMA-20 slope threshold (default: 0.002)
  --poll       Polling interval in seconds (default: 30)
  --log        Log file path (default: paper_trades.jsonl)
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# ── Constants ─────────────────────────────────────────────────────────────────

EWMA_LAMBDA  = 0.94
BM_P50       = 1.572
BM_P75       = 2.049
HL_50_CORR   = 0.921    # BM_P50 has its own FX correction in the DA strategy
HL_75_CORR   = 0.894    # FX HL-75 correction

OANDA_BASES = {
    "live":     "https://api-fxtrade.oanda.com",
    "practice": "https://api-fxpractice.oanda.com",
}

# Session boundaries (UTC): FX day starts at 22:00 UTC (previous calendar day)
SESSION_START_HOUR = 22  # UTC — "today's" session open is 22:00 of previous calendar day
SESSION_END_HOUR   = 22  # UTC — session closes at 21:59:59 (next 22:00 is new session)


def _ts() -> str:
    """Return [HH:MM:SS] timestamp for console output."""
    return datetime.now(timezone.utc).strftime("[%H:%M:%S]")


def _log(msg: str) -> None:
    print(f"{_ts()} {msg}", flush=True)


# ── OANDA client ──────────────────────────────────────────────────────────────

class OandaClient:
    """Thin wrapper around the OANDA REST v3 API."""

    def __init__(self, api_key: str, env: str = "live") -> None:
        self.base_url = OANDA_BASES.get(env, OANDA_BASES["live"])
        self.headers  = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        }

    def _get(self, path: str, params: Optional[dict] = None,
             retries: int = 3, backoff: float = 2.0) -> dict:
        """GET with retry logic."""
        url = f"{self.base_url}{path}"
        for attempt in range(1, retries + 1):
            try:
                r = requests.get(url, headers=self.headers, params=params, timeout=30)
                r.raise_for_status()
                return r.json()
            except requests.RequestException as exc:
                _log(f"OANDA request failed (attempt {attempt}/{retries}): {exc}")
                if attempt < retries:
                    time.sleep(backoff)
                else:
                    raise

    @staticmethod
    def _parse_candles(raw: list) -> list:
        """Convert raw OANDA candle dicts to normalised {time, open, high, low, close}."""
        result = []
        for c in raw:
            if not c.get("complete", True) and c is not raw[-1]:
                continue  # skip incomplete candles except the very last one
            mid = c.get("mid", {})
            result.append({
                "time":  c["time"],
                "open":  float(mid["o"]),
                "high":  float(mid["h"]),
                "low":   float(mid["l"]),
                "close": float(mid["c"]),
            })
        return result

    def get_d1_candles(self, instrument: str, count: int = 300) -> list:
        """Return up to `count` completed D1 candles as list of dicts."""
        data = self._get(
            f"/v3/instruments/{instrument}/candles",
            params={"granularity": "D", "count": count, "price": "M"},
        )
        candles = self._parse_candles(data.get("candles", []))
        # Only completed daily candles for vol estimation
        return [c for c in candles if c is not candles[-1] or
                _is_complete(data["candles"][-1] if data.get("candles") else {})]

    def get_m5_candles(self, instrument: str,
                       from_dt: datetime, to_dt: datetime) -> list:
        """Return M5 candles between from_dt and to_dt."""
        data = self._get(
            f"/v3/instruments/{instrument}/candles",
            params={
                "granularity": "M5",
                "price":       "M",
                "from":        from_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "to":          to_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        return self._parse_candles(data.get("candles", []))

    def get_current_price(self, instrument: str) -> float:
        """Return the latest mid price from the most recent M5 candle."""
        now = datetime.now(timezone.utc)
        ago = now - timedelta(minutes=15)
        bars = self.get_m5_candles(instrument, ago, now)
        if bars:
            return bars[-1]["close"]
        raise RuntimeError(f"Could not retrieve current price for {instrument}")


def _is_complete(raw_candle: dict) -> bool:
    return raw_candle.get("complete", True)


# ── Volatility model ──────────────────────────────────────────────────────────

class VolModel:
    """EWMA(λ=0.94) volatility model matching vol_range_forecast.py."""

    def __init__(self, lambda_: float = EWMA_LAMBDA) -> None:
        self.lambda_ = lambda_

    def compute_sigma(self, closes: list) -> float:
        """
        Compute EWMA(λ) on log returns and return the last σ_d.

        Mirrors ewma_vol_series() from vol_range_forecast.py.
        """
        if len(closes) < 2:
            raise ValueError("Need at least 2 closes to compute sigma")
        lam = self.lambda_
        # Seed variance with sample var of first 20 log returns
        n = len(closes)
        log_rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, n)]
        seed_n = min(20, len(log_rets))
        seed_mean = sum(log_rets[:seed_n]) / seed_n
        v = sum((r - seed_mean) ** 2 for r in log_rets[:seed_n]) / seed_n
        if v == 0:
            v = log_rets[0] ** 2 or 1e-8
        for r in log_rets:
            v = lam * v + (1.0 - lam) * r * r
        return math.sqrt(v)

    def compute_hl_levels(self, sigma_d: float,
                          asset_class: str = "fx") -> tuple:
        """
        Return (hl50_pct, hl75_pct) — the two entry/SL thresholds as percentages.

        FX:
          hl50_pct = BM_P50 × hl_50_corr × σ_d × 100
          hl75_pct = BM_P75 × hl_75_corr × σ_d × 100
        """
        if asset_class == "fx":
            hl50 = BM_P50 * HL_50_CORR * sigma_d * 100.0
            hl75 = BM_P75 * HL_75_CORR * sigma_d * 100.0
        else:
            # For non-FX assets keep the BM multiples without the FX correction
            hl50 = BM_P50 * sigma_d * 100.0
            hl75 = BM_P75 * sigma_d * 100.0
        return hl50, hl75


# ── Regime classifier ─────────────────────────────────────────────────────────

class RegimeClassifier:
    """EMA-20 slope regime classifier matching vol_backtest.py classify_regime()."""

    def classify(self, closes: list, slope_thresh: float = 0.002) -> str:
        """
        Classify regime as 'BULL', 'BEAR', or 'RANGE'.

        Uses EMA-20; slope = (EMA[-1] - EMA[-5]) / EMA[-5]  (5-bar normalised slope).
        """
        ema_span    = 20
        slope_window = 5
        if len(closes) < ema_span + slope_window:
            return "RANGE"

        ema = _ema_series(closes, span=ema_span)
        # Use the last slope_window+1 values
        slope = (ema[-1] - ema[-(slope_window + 1)]) / ema[-(slope_window + 1)]
        if slope > slope_thresh:
            return "BULL"
        if slope < -slope_thresh:
            return "BEAR"
        return "RANGE"


def _ema_series(values: list, span: int) -> list:
    """Compute EMA with adjust=False (matches pandas ewm default)."""
    alpha = 2.0 / (span + 1)
    ema   = [values[0]]
    for v in values[1:]:
        ema.append(alpha * v + (1 - alpha) * ema[-1])
    return ema


# ── Dynamic anchor strategy ───────────────────────────────────────────────────

class DynAnchorStrategy:
    """
    Bar-by-bar Dynamic Anchor signal detector.

    Critical ordering: compute signal levels from CURRENT extremes,
    THEN check bar, THEN update extremes (no lookahead).
    """

    def __init__(self, hl50_pct: float, hl75_pct: float,
                 session_open: float, regime: str,
                 da_dir: str = "both") -> None:
        self.hl50_pct     = hl50_pct
        self.hl75_pct     = hl75_pct
        self.session_open = session_open
        self.regime       = regime
        self.da_dir       = da_dir

        # Extremes initialised to session open
        self.running_high = session_open
        self.running_low  = session_open
        self._filled      = False

    @property
    def is_filled(self) -> bool:
        return self._filled

    def _direction_allowed(self, side: str) -> bool:
        """Check whether the direction filter permits this trade."""
        if self.da_dir == "both":
            return True
        # counter mode: SELL only on BULL, BUY only on BEAR
        if self.da_dir == "counter":
            if side == "SELL" and self.regime == "BULL":
                return True
            if side == "BUY"  and self.regime == "BEAR":
                return True
            return False
        return True

    def process_bar(self, bar: dict) -> Optional[dict]:
        """
        Process one M5 bar.  Returns a signal dict on fill, else None.

        Key ordering (no lookahead):
          1. Compute entry levels from CURRENT running extremes
          2. Check if bar triggers the entry
          3. Update running extremes with bar's H/L
        """
        if self._filled:
            return None

        bar_open  = bar["open"]
        bar_high  = bar["high"]
        bar_low   = bar["low"]

        # Step 1 — compute entry levels from CURRENT extremes
        sell_entry = self.running_low  * (1.0 + self.hl50_pct / 100.0)
        buy_entry  = self.running_high * (1.0 - self.hl50_pct / 100.0)

        sell_sl    = self.running_low  * (1.0 + self.hl75_pct / 100.0)
        buy_sl     = self.running_high * (1.0 - self.hl75_pct / 100.0)

        sell_tp    = self.session_open
        buy_tp     = self.session_open

        signal = None

        # Step 2 — check SELL first (guard: sell_entry must be above bar open)
        if (sell_entry > bar_open
                and bar_high >= sell_entry
                and self._direction_allowed("SELL")):
            signal = {
                "side":       "SELL",
                "entry":      sell_entry,
                "tp":         sell_tp,
                "sl":         sell_sl,
                "regime":     self.regime,
                "fill_time":  bar["time"],
            }

        # Check BUY only if no SELL (guard: buy_entry must be below bar open)
        elif (buy_entry < bar_open
              and bar_low <= buy_entry
              and self._direction_allowed("BUY")):
            signal = {
                "side":       "BUY",
                "entry":      buy_entry,
                "tp":         buy_tp,
                "sl":         buy_sl,
                "regime":     self.regime,
                "fill_time":  bar["time"],
            }

        # Step 3 — update running extremes with this bar
        self.running_high = max(self.running_high, bar_high)
        self.running_low  = min(self.running_low,  bar_low)

        if signal is not None:
            self._filled = True

        return signal


# ── Paper trader ──────────────────────────────────────────────────────────────

class PaperTrader:
    """
    Tracks an open paper position, logs trades to JSONL.
    """

    def __init__(self, log_file: str = "paper_trades.jsonl") -> None:
        self.log_file = log_file
        self.position: Optional[dict] = None
        self._session_meta: dict = {}

    def set_session_meta(self, date: str, pair: str,
                         hl50_pct: float, hl75_pct: float,
                         session_open: float) -> None:
        self._session_meta = {
            "date":         date,
            "pair":         pair,
            "hl50_pct":     round(hl50_pct, 4),
            "hl75_pct":     round(hl75_pct, 4),
            "session_open": round(session_open, 6),
        }

    def on_signal(self, signal: dict) -> None:
        """Store the open position (not yet resolved)."""
        self.position = {
            **self._session_meta,
            "regime":    signal["regime"],
            "side":      signal["side"],
            "entry":     round(signal["entry"], 6),
            "tp":        round(signal["tp"],    6),
            "sl":        round(signal["sl"],    6),
            "fill_time": signal["fill_time"],
            "exit_time": None,
            "outcome":   "open",
            "pnl_pct":   0.0,
            "status":    "open",
        }
        _log(f"SIGNAL  {signal['side']} {self._session_meta.get('pair','')}  "
             f"entry={signal['entry']:.5f}  tp={signal['tp']:.5f}  "
             f"sl={signal['sl']:.5f}  regime={signal['regime']}")

    def on_bar(self, bar: dict) -> None:
        """Check TP/SL against bar, resolve position if hit."""
        if self.position is None or self.position["status"] != "open":
            return

        side  = self.position["side"]
        entry = self.position["entry"]
        tp    = self.position["tp"]
        sl    = self.position["sl"]
        bh    = bar["high"]
        bl    = bar["low"]

        if side == "SELL":
            # SL is above entry (bar high >= sl → loss)
            if bh >= sl:
                self._close("loss", sl, entry, bar["time"])
            elif bl <= tp:
                self._close("win", entry, tp, bar["time"])
        elif side == "BUY":
            # SL is below entry (bar low <= sl → loss)
            if bl <= sl:
                self._close("loss", entry, sl, bar["time"])
            elif bh >= tp:
                self._close("win", tp, entry, bar["time"])

    def _close(self, outcome: str, better: float, worse: float,
               exit_time: str) -> None:
        """Resolve position: calculate P&L and write log."""
        pos           = self.position
        session_open  = pos["session_open"]
        entry         = pos["entry"]
        side          = pos["side"]

        if outcome == "win":
            if side == "SELL":
                pnl_pct = (entry - pos["tp"]) / session_open * 100.0
            else:
                pnl_pct = (pos["tp"] - entry) / session_open * 100.0
        else:  # loss
            if side == "SELL":
                pnl_pct = -((pos["sl"] - entry) / session_open * 100.0)
            else:
                pnl_pct = -((entry - pos["sl"]) / session_open * 100.0)

        pos["outcome"]   = outcome
        pos["pnl_pct"]   = round(pnl_pct, 4)
        pos["exit_time"] = exit_time
        pos["status"]    = "closed"

        _log(f"CLOSE   {side} → {outcome.upper()}  pnl={pnl_pct:+.4f}%  "
             f"exit={exit_time}")
        self._write_log(pos)

    def on_session_end(self, final_price: float) -> None:
        """Mark any open position as EOD (end-of-day) at final price."""
        if self.position is None or self.position["status"] != "open":
            return

        pos          = self.position
        session_open = pos["session_open"]
        entry        = pos["entry"]
        side         = pos["side"]

        if side == "SELL":
            pnl_pct = (entry - final_price) / session_open * 100.0
        else:
            pnl_pct = (final_price - entry) / session_open * 100.0

        pos["outcome"]   = "eod"
        pos["pnl_pct"]   = round(pnl_pct, 4)
        pos["exit_time"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        pos["status"]    = "eod"

        _log(f"EOD     {side} position closed at {final_price:.5f}  "
             f"pnl={pnl_pct:+.4f}%")
        self._write_log(pos)

    def print_summary(self) -> None:
        """Print today's paper trade result."""
        if self.position is None:
            _log("No trade taken today.")
            return
        pos = self.position
        _log(f"Summary: {pos['side']} {pos.get('pair','')}  "
             f"regime={pos['regime']}  outcome={pos['outcome']}  "
             f"pnl={pos['pnl_pct']:+.4f}%  status={pos['status']}")

    def _write_log(self, record: dict) -> None:
        with open(self.log_file, "a") as fh:
            fh.write(json.dumps(record) + "\n")


# ── Bot runner ────────────────────────────────────────────────────────────────

class BotRunner:
    """
    Orchestrates pre-market setup and the intraday polling loop.

    Session window: 22:00 UTC (D-1) → 21:59 UTC (D).
    """

    def __init__(self, client: OandaClient, pair: str,
                 regime_filter: str = "bullbear",
                 dir_filter: str    = "counter",
                 slope_thresh: float = 0.002,
                 poll_interval: int  = 30,
                 log_file: str       = "paper_trades.jsonl") -> None:
        self.client        = client
        self.pair          = pair
        self.regime_filter = regime_filter
        self.dir_filter    = dir_filter
        self.slope_thresh  = slope_thresh
        self.poll_interval = poll_interval
        self.log_file      = log_file

        self.vol_model  = VolModel()
        self.classifier = RegimeClassifier()
        self.trader     = PaperTrader(log_file=log_file)

    # ── Session time helpers ──────────────────────────────────────────────────

    @staticmethod
    def _session_start(now: datetime) -> datetime:
        """
        Return the UTC datetime of the most recent 22:00 UTC.
        That is the open of the current FX trading session.
        """
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        candidate = today.replace(hour=SESSION_START_HOUR)
        if now < candidate:
            candidate -= timedelta(days=1)
        return candidate

    @staticmethod
    def _session_end(session_start: datetime) -> datetime:
        """Session ends 24 h after it starts (next 22:00 UTC)."""
        return session_start + timedelta(hours=24)

    # ── Pre-market setup ──────────────────────────────────────────────────────

    def _pre_market_setup(self) -> Optional[dict]:
        """
        Fetch D1 data, compute vol, classify regime, apply filters.

        Returns None if this session should be skipped (regime filter).
        Returns dict with hl50_pct, hl75_pct, regime on success.
        """
        _log(f"Pre-market setup for {self.pair} …")

        candles = self.client.get_d1_candles(self.pair, count=300)
        if len(candles) < 22:
            _log("Insufficient D1 data — aborting.")
            return None

        closes  = [c["close"] for c in candles]
        sigma_d = self.vol_model.compute_sigma(closes)
        hl50, hl75 = self.vol_model.compute_hl_levels(sigma_d)

        regime = self.classifier.classify(closes, slope_thresh=self.slope_thresh)

        _log(f"σ_d={sigma_d:.6f}  hl50={hl50:.4f}%  hl75={hl75:.4f}%  "
             f"regime={regime}")

        # Regime filter
        if self.regime_filter == "bullbear" and regime == "RANGE":
            _log(f"Regime=RANGE and filter=bullbear — skipping today.")
            return None
        if self.regime_filter == "bull" and regime != "BULL":
            _log(f"Regime={regime} and filter=bull — skipping today.")
            return None
        if self.regime_filter == "bear" and regime != "BEAR":
            _log(f"Regime={regime} and filter=bear — skipping today.")
            return None

        # Direction filter sanity check (counter: only trade against the trend)
        if self.dir_filter == "counter":
            if regime == "BULL":
                _log("Counter mode: will only look for SELL signals (fade the high).")
            elif regime == "BEAR":
                _log("Counter mode: will only look for BUY signals (fade the low).")
            else:
                _log("Counter mode with RANGE: both directions remain open.")

        return {"hl50_pct": hl50, "hl75_pct": hl75, "regime": regime}

    # ── Session open price ────────────────────────────────────────────────────

    def _get_session_open(self, session_start: datetime) -> Optional[float]:
        """
        Return the session open price: close of the 22:00 M5 bar
        (or the first available bar after session_start).
        """
        window_end = session_start + timedelta(minutes=30)
        bars = self.client.get_m5_candles(self.pair, session_start, window_end)
        if bars:
            price = bars[0]["open"]
            _log(f"Session open price: {price:.5f}  (bar time: {bars[0]['time']})")
            return price
        _log("Could not determine session open price.")
        return None

    # ── Main intraday loop ────────────────────────────────────────────────────

    def _run_session(self, setup: dict, session_start: datetime,
                     session_end: datetime) -> None:
        """
        Poll M5 bars throughout the session, feed to strategy, log signals.
        """
        hl50    = setup["hl50_pct"]
        hl75    = setup["hl75_pct"]
        regime  = setup["regime"]

        # Get session open from first bar
        session_open = self._get_session_open(session_start)
        if session_open is None:
            _log("Aborting session — no open price available.")
            return

        # Set metadata for logging
        date_str = session_start.strftime("%Y-%m-%d")
        if session_start.hour == SESSION_START_HOUR:
            # The session date is the NEXT calendar day
            date_str = (session_start + timedelta(days=1)).strftime("%Y-%m-%d")

        self.trader.set_session_meta(
            date=date_str, pair=self.pair,
            hl50_pct=hl50, hl75_pct=hl75,
            session_open=session_open,
        )

        strategy = DynAnchorStrategy(
            hl50_pct=hl50, hl75_pct=hl75,
            session_open=session_open,
            regime=regime,
            da_dir=self.dir_filter,
        )

        _log(f"Session running: {session_start.strftime('%Y-%m-%dT%H:%M:%SZ')} → "
             f"{session_end.strftime('%Y-%m-%dT%H:%M:%SZ')}")

        last_bar_time: Optional[str] = None
        signal_logged = False

        while True:
            now = datetime.now(timezone.utc)
            if now >= session_end:
                _log("Session end reached.")
                break

            # Fetch bars since session start up to now
            try:
                bars = self.client.get_m5_candles(self.pair, session_start, now)
            except Exception as exc:
                _log(f"Error fetching M5 bars: {exc} — retrying next poll.")
                time.sleep(self.poll_interval)
                continue

            # Filter to only new completed bars we haven't seen yet
            new_bars = [
                b for b in bars
                if (last_bar_time is None or b["time"] > last_bar_time)
            ]

            for bar in new_bars:
                last_bar_time = bar["time"]

                # Check TP/SL on open position
                self.trader.on_bar(bar)

                # Feed to strategy (only before fill)
                if not strategy.is_filled and not signal_logged:
                    sig = strategy.process_bar(bar)
                    if sig is not None:
                        self.trader.on_signal(sig)
                        signal_logged = True

            if now + timedelta(seconds=self.poll_interval) >= session_end:
                # Sleep until session end
                remaining = (session_end - now).total_seconds()
                _log(f"Waiting {remaining:.0f}s for session end …")
                time.sleep(max(0, remaining))
                break

            time.sleep(self.poll_interval)

        # Session over — mark any open position as EOD
        try:
            final_price = self.client.get_current_price(self.pair)
        except Exception:
            final_price = session_open
        self.trader.on_session_end(final_price)
        self.trader.print_summary()

    # ── Run (public entry point) ──────────────────────────────────────────────

    def run(self) -> None:
        """
        Main loop: run today's session, then sleep until next session.
        Runs indefinitely until interrupted.
        """
        _log(f"Dynamic Anchor Paper Bot starting — pair={self.pair}  "
             f"regime={self.regime_filter}  dir={self.dir_filter}")

        while True:
            now           = datetime.now(timezone.utc)
            session_start = self._session_start(now)
            session_end   = self._session_end(session_start)

            _log(f"New session: {session_start.strftime('%Y-%m-%dT%H:%M:%SZ')} → "
                 f"{session_end.strftime('%Y-%m-%dT%H:%M:%SZ')}")

            # If we are before session start wait
            if now < session_start:
                wait = (session_start - now).total_seconds()
                _log(f"Waiting {wait:.0f}s for session start …")
                time.sleep(wait)
                now = datetime.now(timezone.utc)

            # Pre-market setup (runs close to session start)
            setup = None
            for _attempt in range(3):
                try:
                    setup = self._pre_market_setup()
                    break
                except Exception as exc:
                    _log(f"Pre-market setup error: {exc}")
                    time.sleep(5)

            if setup is not None:
                self._run_session(setup, session_start, session_end)
            else:
                # Skip to end of session
                remaining = (session_end - datetime.now(timezone.utc)).total_seconds()
                if remaining > 0:
                    _log(f"Session skipped — sleeping {remaining:.0f}s until next session.")
                    time.sleep(remaining)

            # Small buffer before next session
            time.sleep(5)


# ── Backfill mode ─────────────────────────────────────────────────────────────

def run_backfill(client: OandaClient, pair: str,
                 regime_filter: str, dir_filter: str,
                 slope_thresh: float, log_file: str) -> None:
    """
    Replay yesterday's M5 data bar-by-bar using yesterday's D1 context.
    Useful for verifying the strategy logic without waiting for live market.
    """
    _log(f"Backfill mode — replaying yesterday's M5 data for {pair}")

    now       = datetime.now(timezone.utc)
    # Yesterday's session: 22:00 two days ago → 22:00 yesterday
    sess_end   = now.replace(hour=SESSION_START_HOUR, minute=0,
                             second=0, microsecond=0)
    if sess_end > now:
        sess_end -= timedelta(days=1)
    sess_start = sess_end - timedelta(hours=24)

    _log(f"Replaying: {sess_start.strftime('%Y-%m-%dT%H:%M:%SZ')} → "
         f"{sess_end.strftime('%Y-%m-%dT%H:%M:%SZ')}")

    vol_model  = VolModel()
    classifier = RegimeClassifier()
    trader     = PaperTrader(log_file=log_file)

    # D1 data up to the day before the session
    candles = client.get_d1_candles(pair, count=300)
    if len(candles) < 22:
        _log("Insufficient D1 data for backfill.")
        return

    closes  = [c["close"] for c in candles]
    sigma_d = vol_model.compute_sigma(closes)
    hl50, hl75 = vol_model.compute_hl_levels(sigma_d)
    regime  = classifier.classify(closes, slope_thresh=slope_thresh)

    _log(f"σ_d={sigma_d:.6f}  hl50={hl50:.4f}%  hl75={hl75:.4f}%  regime={regime}")

    # Regime filter
    if regime_filter == "bullbear" and regime == "RANGE":
        _log("Regime=RANGE — no trade yesterday under bullbear filter.")
        return
    if regime_filter == "bull" and regime != "BULL":
        _log(f"Regime={regime} — no trade yesterday under bull filter.")
        return
    if regime_filter == "bear" and regime != "BEAR":
        _log(f"Regime={regime} — no trade yesterday under bear filter.")
        return

    # Fetch M5 bars for yesterday's session
    bars = client.get_m5_candles(pair, sess_start, sess_end)
    if not bars:
        _log("No M5 bars found for yesterday.")
        return
    _log(f"Fetched {len(bars)} M5 bars.")

    session_open = bars[0]["open"]
    _log(f"Session open: {session_open:.5f}")

    date_str = (sess_start + timedelta(days=1)).strftime("%Y-%m-%d")
    trader.set_session_meta(
        date=date_str, pair=pair,
        hl50_pct=hl50, hl75_pct=hl75,
        session_open=session_open,
    )

    strategy = DynAnchorStrategy(
        hl50_pct=hl50, hl75_pct=hl75,
        session_open=session_open,
        regime=regime,
        da_dir=dir_filter,
    )

    signal_logged = False
    for bar in bars:
        trader.on_bar(bar)
        if not strategy.is_filled and not signal_logged:
            sig = strategy.process_bar(bar)
            if sig is not None:
                trader.on_signal(sig)
                signal_logged = True

    final_price = bars[-1]["close"]
    trader.on_session_end(final_price)
    trader.print_summary()


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Dynamic Anchor Paper Trading Bot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--pair",     default="EUR_USD",
                        help="OANDA instrument (default: EUR_USD)")
    parser.add_argument("--regime",   default="bullbear",
                        choices=["all", "bullbear", "bull", "bear"],
                        help="Regime filter (default: bullbear)")
    parser.add_argument("--dir",      default="counter",
                        choices=["both", "counter"],
                        help="Direction filter (default: counter)")
    parser.add_argument("--env",      default=None,
                        choices=["live", "practice"],
                        help="OANDA env (default: OANDA_ENV or live)")
    parser.add_argument("--slope",    type=float, default=0.002,
                        help="EMA-20 slope threshold (default: 0.002)")
    parser.add_argument("--poll",     type=int,   default=30,
                        help="Polling interval in seconds (default: 30)")
    parser.add_argument("--log",      default="paper_trades.jsonl",
                        help="Log file path (default: paper_trades.jsonl)")
    parser.add_argument("--backfill", action="store_true",
                        help="Replay yesterday's M5 data to verify logic")
    args = parser.parse_args()

    # Credentials
    api_key = os.environ.get("OANDA_KEY")
    if not api_key:
        print("ERROR: OANDA_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)

    env = args.env or os.environ.get("OANDA_ENV", "live")

    client = OandaClient(api_key=api_key, env=env)

    if args.backfill:
        run_backfill(
            client=client, pair=args.pair,
            regime_filter=args.regime, dir_filter=args.dir,
            slope_thresh=args.slope, log_file=args.log,
        )
        return

    runner = BotRunner(
        client=client,
        pair=args.pair,
        regime_filter=args.regime,
        dir_filter=args.dir,
        slope_thresh=args.slope,
        poll_interval=args.poll,
        log_file=args.log,
    )
    try:
        runner.run()
    except KeyboardInterrupt:
        _log("Bot interrupted — exiting.")


if __name__ == "__main__":
    main()
