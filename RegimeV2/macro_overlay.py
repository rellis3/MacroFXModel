"""
RegimeV2 — Macro overlay.

Fetches and caches:
  - VIX term structure (^VIX / ^VIX3M) from Yahoo Finance — hourly
  - CBOE FX implied vol indices per pair — 6h refresh via yfinance
      ^EUVIX (EUR/USD), ^BPVIX (GBP/USD), ^JYVIX (USD/JPY), ^GVZ (Gold)
  - FOMC meeting dates — daily check from hardcoded 2026 calendar
  - Forex Factory high-impact news — daily cache from public JSON
  - Session label → multiplier mapping from HMM API sessionLabel field

Provides a single MacroOverlay.snapshot() dict that the main loop reads.
All fetches are non-blocking: stale data is returned on any error.
"""

import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests

log = logging.getLogger(__name__)

# ── FOMC 2026 meeting dates (UTC, day of announcement ~18:00 UTC) ──────────────

_FOMC_DATES_2026 = [
    '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
    '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16',
]

# ── Session multipliers (lower = raise effective conf threshold) ───────────────

_SESSION_MULTIPLIERS = {
    'CALM':    0.75,   # typically Asian session
    'CAUTION': 0.90,   # transitional / pre-London
    'STRESS':  1.00,   # London/NY overlap — highest activity
}

# UTC hour → session label (simplified mapping)
_HOUR_SESSION: dict[int, str] = {}
for _h in range(24):
    if 7 <= _h < 17:
        _HOUR_SESSION[_h] = 'STRESS'
    elif 5 <= _h < 7 or 17 <= _h < 20:
        _HOUR_SESSION[_h] = 'CAUTION'
    else:
        _HOUR_SESSION[_h] = 'CALM'


def session_multiplier_from_label(label: str) -> float:
    return _SESSION_MULTIPLIERS.get(label.upper(), 0.90)


def session_multiplier_from_utc() -> float:
    h = datetime.now(timezone.utc).hour
    return _SESSION_MULTIPLIERS.get(_HOUR_SESSION.get(h, 'CALM'), 0.90)


# ── VIX term structure ─────────────────────────────────────────────────────────

class VIXFetcher:
    """Fetches VIX spot (^VIX) and 3-month (^VIX3M) from Yahoo Finance."""

    _REFRESH_SECS = 3600  # hourly

    def __init__(self):
        self._vix:      Optional[float] = None
        self._vix3m:    Optional[float] = None
        self._ratio:    Optional[float] = None
        self._fetched:  float = 0.0

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            import yfinance as yf
            data = yf.download(['^VIX', '^VIX3M'], period='1d', progress=False, auto_adjust=True)
            closes = data['Close']
            vix   = float(closes['^VIX'].dropna().iloc[-1])
            vix3m = float(closes['^VIX3M'].dropna().iloc[-1])
            self._vix    = round(vix, 2)
            self._vix3m  = round(vix3m, 2)
            self._ratio  = round(vix3m / vix, 4) if vix > 0 else None
            self._fetched = now
            log.info(f'[VIX] spot={self._vix}  3m={self._vix3m}  ratio={self._ratio}')
        except ImportError:
            log.warning('[VIX] yfinance not installed — skipping VIX fetch')
            self._fetched = now  # don't retry until next hour
        except Exception as exc:
            log.warning(f'[VIX] fetch failed: {exc}')

    @property
    def vix(self) -> Optional[float]:
        return self._vix

    @property
    def vix3m(self) -> Optional[float]:
        return self._vix3m

    @property
    def ratio(self) -> Optional[float]:
        return self._ratio

    @property
    def is_backwardation(self) -> bool:
        """True when VIX3M/VIX < 0.95 — front-month stress elevated."""
        return self._ratio is not None and self._ratio < 0.95

    @property
    def is_stress(self) -> bool:
        """True when VIX > 25 — elevated systemic risk."""
        return self._vix is not None and self._vix > 25.0


# ── CBOE FX Implied Volatility ────────────────────────────────────────────────

# CBOE publishes settlement implied vol indices for major FX pairs and Gold.
# All are available free via yfinance. No API key required.
_CBOE_FETCH = ['^EUVIX', '^BPVIX', '^JYVIX', '^GVZ']

# Which CBOE index to use for each pair.
# Pairs without a dedicated index use the nearest FX vol proxy.
_PAIR_VOL_INDEX: dict[str, str] = {
    'EUR/USD':    '^EUVIX',
    'GBP/USD':    '^BPVIX',
    'USD/JPY':    '^JYVIX',
    'AUD/USD':    '^EUVIX',   # no dedicated AUD index — USD vol proxy
    'NZD/USD':    '^EUVIX',
    'USD/CAD':    '^EUVIX',
    'USD/CHF':    '^EUVIX',
    'GBP/JPY':    '^BPVIX',   # GBP component dominates
    'XAU/USD':    '^GVZ',     # CBOE Gold ETF Volatility Index
    'NAS100_USD': None,       # use VIX already tracked by VIXFetcher
}

_VOL_EXTREME_PCT  = 85   # above this 52-week percentile = block entries
_VOL_ELEVATED_PCT = 65   # above this = warn in heartbeat


class CBOEVolFetcher:
    """
    Fetches CBOE FX implied volatility indices via yfinance (6h refresh).

    For each pair, provides:
      - Current index level (annualised implied vol %)
      - 52-week percentile (0–100) — how elevated is vol vs the past year?
      - is_extreme(pair) — True when vol is in the top 15% of the past year

    Cross-asset coherence flag: True when all three FX indices are
    simultaneously above their 50th percentile — signals systemic risk-off
    rather than a pair-specific move.
    """

    _REFRESH_SECS = 3600 * 6  # 6h — EOD settlement values, rarely intraday

    def __init__(self):
        self._levels:    dict[str, float] = {}
        self._pct:       dict[str, float] = {}
        self._fetched:   float = 0.0
        self._coherence: bool  = False

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            import yfinance as yf
            data = yf.download(_CBOE_FETCH, period='1y', progress=False, auto_adjust=True)
            closes = data['Close']

            levels: dict[str, float] = {}
            pcts:   dict[str, float] = {}
            for sym in _CBOE_FETCH:
                col = sym if sym in closes.columns else None
                if col is None:
                    continue
                series = closes[col].dropna()
                if len(series) < 20:
                    continue
                current = float(series.iloc[-1])
                pct     = float((series < current).mean() * 100)
                levels[sym] = round(current, 2)
                pcts[sym]   = round(pct, 1)

            self._levels  = levels
            self._pct     = pcts
            self._fetched = now

            fx_syms   = ['^EUVIX', '^BPVIX', '^JYVIX']
            available = [s for s in fx_syms if s in pcts]
            self._coherence = (
                len(available) >= 2 and
                all(pcts[s] >= 50 for s in available)
            )

            summary = '  '.join(
                f'{s}={levels[s]:.1f}({pcts[s]:.0f}%ile)' for s in levels
            )
            log.info(f'[CVOL] {summary}  coherence={self._coherence}')
        except ImportError:
            log.warning('[CVOL] yfinance not installed — skipping CBOE vol fetch')
            self._fetched = now
        except Exception as exc:
            log.warning(f'[CVOL] fetch failed: {exc}')

    def pair_vol_level(self, pair: str) -> Optional[float]:
        sym = _PAIR_VOL_INDEX.get(pair)
        return self._levels.get(sym) if sym else None

    def pair_vol_pct(self, pair: str) -> Optional[float]:
        """52-week percentile 0–100. Higher = more elevated implied vol."""
        sym = _PAIR_VOL_INDEX.get(pair)
        return self._pct.get(sym) if sym else None

    def is_extreme(self, pair: str) -> bool:
        """True when implied vol is above the 85th percentile of the past year."""
        pct = self.pair_vol_pct(pair)
        return pct is not None and pct >= _VOL_EXTREME_PCT

    def is_elevated(self, pair: str) -> bool:
        """True when implied vol is above the 65th percentile — warn but don't block."""
        pct = self.pair_vol_pct(pair)
        return pct is not None and pct >= _VOL_ELEVATED_PCT

    @property
    def coherence(self) -> bool:
        """True when all FX vol indices are simultaneously elevated — systemic stress."""
        return self._coherence


# ── FOMC calendar ─────────────────────────────────────────────────────────────

class FOMCCalendar:
    """Checks proximity to next FOMC meeting."""

    def __init__(self, dates: list[str] | None = None):
        raw = dates or _FOMC_DATES_2026
        self._dates = [
            datetime.strptime(d, '%Y-%m-%d').replace(
                hour=18, minute=0, tzinfo=timezone.utc
            )
            for d in raw
        ]

    def hours_to_next(self) -> Optional[float]:
        now = datetime.now(timezone.utc)
        upcoming = [d for d in self._dates if d > now]
        if not upcoming:
            return None
        delta = upcoming[0] - now
        return round(delta.total_seconds() / 3600, 1)

    def is_window(self, hours: float = 48.0) -> bool:
        h = self.hours_to_next()
        return h is not None and h <= hours

    def next_date_str(self) -> Optional[str]:
        now = datetime.now(timezone.utc)
        upcoming = [d for d in self._dates if d > now]
        if not upcoming:
            return None
        return upcoming[0].strftime('%Y-%m-%d')


# ── Forex Factory news calendar ───────────────────────────────────────────────

_FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

_HIGH_CURRENCIES = {'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'}

_PAIR_CURRENCIES: dict[str, set[str]] = {
    'EUR/USD': {'EUR', 'USD'}, 'GBP/USD': {'GBP', 'USD'},
    'USD/JPY': {'USD', 'JPY'}, 'AUD/USD': {'AUD', 'USD'},
    'NZD/USD': {'NZD', 'USD'}, 'USD/CAD': {'USD', 'CAD'},
    'USD/CHF': {'USD', 'CHF'}, 'GBP/JPY': {'GBP', 'JPY'},
    'XAU/USD': {'USD'},        'NAS100_USD': {'USD'},
}


class NewsFetcher:
    """Fetches and caches Forex Factory high-impact news events."""

    _REFRESH_SECS = 3600 * 6  # re-fetch every 6h (calendar changes rarely mid-week)

    def __init__(self):
        self._events: list[dict] = []
        self._fetched: float = 0.0

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            r = requests.get(_FF_URL, timeout=10)
            r.raise_for_status()
            raw = r.json()
            events = []
            for ev in raw:
                if ev.get('impact', '').lower() != 'high':
                    continue
                currency = (ev.get('country') or '').upper()
                title    = ev.get('title', '')
                date_str = ev.get('date', '')
                if not date_str:
                    continue
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                events.append({'currency': currency, 'title': title, 'dt': dt})
            self._events  = events
            self._fetched = now
            log.info(f'[NEWS] Loaded {len(events)} high-impact events this week')
        except Exception as exc:
            log.warning(f'[NEWS] fetch failed: {exc}')

    def next_event_for_pair(self, pair: str, window_mins: int = 60
                             ) -> Optional[dict]:
        """
        Returns the soonest high-impact event for currencies in `pair`
        within the next `window_mins` minutes, or None.
        """
        now = datetime.now(timezone.utc)
        pair_curs = _PAIR_CURRENCIES.get(pair, set())
        cutoff = now + timedelta(minutes=window_mins)
        candidates = []
        for ev in self._events:
            if ev['currency'] not in pair_curs:
                continue
            dt = ev['dt']
            if now <= dt <= cutoff:
                candidates.append(ev)
        if not candidates:
            return None
        candidates.sort(key=lambda e: e['dt'])
        ev = candidates[0]
        mins_away = (ev['dt'] - now).total_seconds() / 60
        return {
            'name':     ev['title'],
            'currency': ev['currency'],
            'dt':       ev['dt'].isoformat(),
            'mins_away': round(mins_away, 1),
        }

    def is_blocked(self, pair: str,
                   pre_mins: int = 10, post_mins: int = 5) -> tuple[bool, str]:
        """
        Returns (True, reason) if within pre/post window of a high-impact event.
        Block is entry-only — existing positions are NOT closed.
        """
        now = datetime.now(timezone.utc)
        pair_curs = _PAIR_CURRENCIES.get(pair, set())
        for ev in self._events:
            if ev['currency'] not in pair_curs:
                continue
            dt = ev['dt']
            mins_to = (dt - now).total_seconds() / 60
            mins_after = (now - dt).total_seconds() / 60
            if -post_mins <= mins_after <= 0 and mins_to > 0:
                # upcoming within pre_mins
                if 0 < mins_to <= pre_mins:
                    return True, f"{ev['title']} in {mins_to:.0f}m"
            if 0 <= mins_after <= post_mins:
                return True, f"{ev['title']} (just released)"
        return False, ''


# ── Composite MacroOverlay ─────────────────────────────────────────────────────

class MacroOverlay:
    """
    Single entry point for all macro context.
    Call refresh() once per loop iteration (all fetches are self-throttled).
    Call snapshot() to get a plain dict for the main bot loop.
    """

    def __init__(self, fomc_window_hours: float = 48.0,
                 vix_backwardation_threshold: float = 0.95):
        self.vix         = VIXFetcher()
        self.cboe_vol    = CBOEVolFetcher()
        self.fomc        = FOMCCalendar()
        self.news        = NewsFetcher()
        self._fomc_win   = fomc_window_hours
        self._vix_thresh = vix_backwardation_threshold

    def refresh(self) -> None:
        self.vix.refresh()
        self.cboe_vol.refresh()
        self.news.refresh()

    def session_multiplier(self, session_label: str = '') -> float:
        if session_label:
            return session_multiplier_from_label(session_label)
        return session_multiplier_from_utc()

    def is_entry_blocked(self, pair: str) -> tuple[bool, str]:
        """
        Returns (True, reason) if macro conditions block new entries.
        Does NOT block exits.
        """
        # VIX backwardation
        if self.vix.is_backwardation:
            return True, f'VIX backwardation (ratio={self.vix.ratio:.2f}) — macro stress'

        # FOMC window
        if self.fomc.is_window(self._fomc_win):
            h = self.fomc.hours_to_next()
            return True, f'FOMC in {h:.0f}h — elevated uncertainty window'

        # High-impact news
        blocked, reason = self.news.is_blocked(pair)
        if blocked:
            return True, f'News block: {reason}'

        # CBOE implied vol extreme (top 15% of past year)
        if self.cboe_vol.is_extreme(pair):
            pct   = self.cboe_vol.pair_vol_pct(pair)
            level = self.cboe_vol.pair_vol_level(pair)
            return True, f'Implied vol extreme: {level:.1f} ({pct:.0f}th %ile) — regime signals unreliable'

        return False, ''

    def snapshot(self, pair: str = '') -> dict:
        """
        Returns a plain dict with all macro context fields.
        Safe to call every loop — all data is cached.
        """
        next_ev = self.news.next_event_for_pair(pair, window_mins=60) if pair else None
        fomc_h  = self.fomc.hours_to_next()

        return {
            'vix':             self.vix.vix,
            'vix3m':           self.vix.vix3m,
            'vix_ratio':       self.vix.ratio,
            'vix_stress':      self.vix.is_stress,
            'vix_backw':       self.vix.is_backwardation,
            'fomc_hours_away': fomc_h,
            'fomc_next_date':  self.fomc.next_date_str(),
            'fomc_window':     self.fomc.is_window(self._fomc_win),
            'next_news_name':  next_ev['name']     if next_ev else None,
            'next_news_mins':  next_ev['mins_away'] if next_ev else None,
            'next_news_cur':   next_ev['currency']  if next_ev else None,
            # CBOE FX implied vol
            'pair_vol_level':  self.cboe_vol.pair_vol_level(pair) if pair else None,
            'pair_vol_pct':    self.cboe_vol.pair_vol_pct(pair)   if pair else None,
            'vol_extreme':     self.cboe_vol.is_extreme(pair)     if pair else False,
            'vol_elevated':    self.cboe_vol.is_elevated(pair)    if pair else False,
            'vol_coherence':   self.cboe_vol.coherence,
        }

    def label(self) -> str:
        """Short one-line macro summary for logging."""
        parts = []
        if self.vix.vix:
            parts.append(f'VIX={self.vix.vix:.1f}')
        if self.vix.is_backwardation:
            parts.append('⚠backw')
        if self.fomc.is_window(self._fomc_win):
            parts.append(f'FOMC<{self._fomc_win:.0f}h')
        if self.cboe_vol.coherence:
            parts.append('vol-coherent')
        return '  '.join(parts) if parts else 'macro:ok'
