"""
RegimeV2 — Macro overlay.

Fetches and caches:
  - VIX spot (^VIX) from Yahoo Finance — hourly
  - CBOE FX/Gold implied vol indices via FRED API — 6h refresh
      EVZCLS (EUR/USD proxy for all FX pairs), GVZCLS (Gold)
      Requires FRED_KEY env var — free at fred.stlouisfed.org
      Note: ^EUVIX / ^BPVIX / ^JYVIX were delisted from Yahoo Finance;
      FRED carries EVZCLS (CBOE EuroCurrency ETF Vol) as the replacement.
  - FOMC meeting dates — daily check from hardcoded 2026 calendar
  - Forex Factory high-impact news — daily cache from public JSON
  - Session label → multiplier mapping from HMM API sessionLabel field

Provides a single MacroOverlay.snapshot() dict that the main loop reads.
All fetches are non-blocking: stale data is returned on any error.
"""

import logging
import os
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
    """Fetches VIX spot (^VIX) from Yahoo Finance. Term structure dropped — ^VIX3M/^VXMT not on YF."""

    _REFRESH_SECS = 3600  # hourly

    def __init__(self):
        self._vix:      Optional[float] = None
        self._vix3m:    Optional[float] = None   # always None — no source available
        self._ratio:    Optional[float] = None   # always None
        self._fetched:  float = 0.0

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            import yfinance as yf
            data   = yf.download('^VIX', period='5d', progress=False, auto_adjust=True)
            closes = data['Close'].squeeze().dropna()
            self._vix     = round(float(closes.iloc[-1]), 2)
            self._fetched = now
            log.info(f'[VIX] spot={self._vix}')
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


# ── FX / Gold Implied Volatility — FRED API ──────────────────────────────────
#
# ^EUVIX / ^BPVIX / ^JYVIX were delisted from Yahoo Finance.
# FRED carries the equivalent CBOE settlement vol indices free with an API key.
# Register at https://fred.stlouisfed.org/ and set env var FRED_KEY.
#
#   EVZCLS — CBOE EuroCurrency ETF Volatility Index (EUR/USD 1-month IV)
#   GVZCLS — CBOE Gold ETF Volatility Index
#
# FRED has no dedicated GBP or JPY vol index; EVZCLS serves as the FX
# implied-vol proxy for all non-gold pairs (same role ^EUVIX played).

_FRED_API_BASE = 'https://api.stlouisfed.org/fred/series/observations'
_FRED_SERIES   = ['EVZCLS', 'GVZCLS']

_PAIR_VOL_SERIES: dict[str, str | None] = {
    'EUR/USD':    'EVZCLS',
    'GBP/USD':    'EVZCLS',
    'USD/JPY':    'EVZCLS',
    'AUD/USD':    'EVZCLS',
    'NZD/USD':    'EVZCLS',
    'USD/CAD':    'EVZCLS',
    'USD/CHF':    'EVZCLS',
    'GBP/JPY':    'EVZCLS',
    'XAU/USD':    'GVZCLS',
    'NAS100_USD': None,
}

_VOL_EXTREME_PCT  = 85   # above this 52-week percentile = block entries
_VOL_ELEVATED_PCT = 65   # above this = warn in heartbeat


def _fred_fetch(series_id: str, api_key: str) -> list[float]:
    """Returns up to 5y of daily observations for a FRED series, oldest-first."""
    start = (datetime.now(timezone.utc) - timedelta(days=1825)).strftime('%Y-%m-%d')
    r = requests.get(
        _FRED_API_BASE,
        params={
            'series_id':         series_id,
            'api_key':           api_key,
            'file_type':         'json',
            'observation_start': start,
            'sort_order':        'asc',
        },
        timeout=10,
    )
    r.raise_for_status()
    values: list[float] = []
    for obs in r.json().get('observations', []):
        v = obs.get('value', '.')
        if v != '.':
            try:
                values.append(float(v))
            except ValueError:
                pass
    return values


class CBOEVolFetcher:
    """
    Fetches CBOE FX and Gold implied volatility indices via FRED API (6h refresh).

    Requires FRED_KEY environment variable (free at fred.stlouisfed.org).

    Series:
      EVZCLS — CBOE EuroCurrency ETF Volatility Index (EUR/USD 1-month IV)
      GVZCLS — CBOE Gold ETF Volatility Index

    For each pair, provides:
      - Current index level (annualised implied vol %)
      - 52-week percentile (0–100) — how elevated is vol vs the past year?
      - is_extreme(pair) — True when vol is in the top 15% of the past year

    Coherence flag: True when EVZCLS is above its 50th percentile — broad FX
    implied vol elevated, signalling systemic rather than pair-specific stress.
    """

    _REFRESH_SECS       = 3600 * 6  # 6h — EOD settlement values
    _RETRY_SECS_ON_FAIL = 300        # 5-min retry when FRED is down

    def __init__(self, dashboard_url: Optional[str] = None):
        self._levels:    dict[str, float] = {}
        self._pct:       dict[str, float] = {}
        self._fetched:   float = 0.0
        self._coherence: bool  = False
        self._dashboard_url = dashboard_url.rstrip('/') if dashboard_url else None

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return

        if self._dashboard_url and self._refresh_from_dashboard(now):
            return

        api_key = os.environ.get('FRED_KEY', '')
        if not api_key:
            log.warning('[CVOL] FRED_KEY not set and dashboard unavailable — skipping vol fetch')
            self._fetched = now
            return
        levels: dict[str, float] = {}
        pcts:   dict[str, float] = {}
        any_ok = False
        for series_id in _FRED_SERIES:
            try:
                values = _fred_fetch(series_id, api_key)
                if len(values) < 20:
                    log.debug(f'[CVOL] {series_id}: only {len(values)} observations — series may be discontinued')
                    continue
                current           = values[-1]
                pct               = sum(v < current for v in values) / len(values) * 100
                levels[series_id] = round(current, 2)
                pcts[series_id]   = round(pct, 1)
                any_ok = True
            except Exception as exc:
                log.warning(f'[CVOL] {series_id} fetch failed: {exc}')

        if any_ok:
            self._levels    = levels
            self._pct       = pcts
            self._fetched   = now
            self._coherence = pcts.get('EVZCLS', 0) >= 50
        else:
            # All fetches failed — retry in 5 min rather than waiting the full 6h
            self._fetched = now - self._REFRESH_SECS + self._RETRY_SECS_ON_FAIL

        if any_ok:
            summary = '  '.join(
                f'{s}={levels[s]:.1f}({pcts[s]:.0f}%ile)' for s in levels
            )
            log.info(f'[CVOL] {summary}  coherence={self._coherence}')

    def _refresh_from_dashboard(self, now: float) -> bool:
        """Try the dashboard's /api/cvol, which has FRED_KEY on Railway. Returns True on success."""
        try:
            r = requests.get(f'{self._dashboard_url}/api/cvol', timeout=10)
            r.raise_for_status()
            d = r.json()
            if not d.get('ok') or not d.get('levels'):
                return False
            self._levels    = d['levels']
            self._pct       = d['pct']
            self._coherence = bool(d.get('coherence', False))
            self._fetched   = now
            summary = '  '.join(
                f'{s}={self._levels[s]:.1f}({self._pct[s]:.0f}%ile)' for s in self._levels
            )
            log.info(f'[CVOL] (via dashboard) {summary}  coherence={self._coherence}')
            return True
        except Exception as exc:
            log.debug(f'[CVOL] dashboard fetch failed, falling back to direct FRED: {exc}')
            return False

    def pair_vol_level(self, pair: str) -> Optional[float]:
        sym = _PAIR_VOL_SERIES.get(pair)
        return self._levels.get(sym) if sym else None

    def pair_vol_pct(self, pair: str) -> Optional[float]:
        """52-week percentile 0–100. Higher = more elevated implied vol."""
        sym = _PAIR_VOL_SERIES.get(pair)
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
        """True when FX implied vol (EVZCLS) is above its 50th percentile — broad stress."""
        return self._coherence


# ── DXY — US Dollar Index ─────────────────────────────────────────────────────

class DXYFetcher:
    """
    Fetches the US Dollar Index (DX-Y.NYB) via yfinance. Hourly refresh.

    Provides the 5-day % change as a directional trend signal.
    Positive = USD strengthening.  Negative = USD weakening.
    Used by the composite score to detect DXY / pair-direction conflicts.
    """

    _REFRESH_SECS = 3600
    _SYMBOL       = 'DX-Y.NYB'

    def __init__(self):
        self._level:    Optional[float] = None
        self._trend_5d: float           = 0.0
        self._fetched:  float           = 0.0

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            import yfinance as yf
            data   = yf.download(self._SYMBOL, period='1mo', progress=False, auto_adjust=True)
            closes = data['Close'].squeeze().dropna()
            if len(closes) < 6:
                return
            current        = float(closes.iloc[-1])
            five_ago       = float(closes.iloc[-6])
            self._level    = round(current, 3)
            self._trend_5d = round((current - five_ago) / five_ago * 100, 3)
            self._fetched  = now
            log.info(f'[DXY] level={self._level}  5d={self._trend_5d:+.2f}%')
        except ImportError:
            self._fetched = now
        except Exception as exc:
            log.warning(f'[DXY] fetch failed: {exc}')

    @property
    def level(self) -> Optional[float]:
        return self._level

    @property
    def trend_5d(self) -> float:
        """5-day % change. Positive = USD strengthening."""
        return self._trend_5d

    @property
    def is_rising(self) -> bool:
        return self._trend_5d > 0.30

    @property
    def is_falling(self) -> bool:
        return self._trend_5d < -0.30


# ── Credit spread proxy — HYG ──────────────────────────────────────────────────

class CreditFetcher:
    """
    Fetches HYG (iShares iBoxx $ High Yield Corporate Bond ETF) via yfinance.
    Hourly refresh.

    A falling HYG = widening credit spreads = risk-off.
    The 5-day return is used as a credit health proxy:
      > 0%  = stable / risk-on
      < -1% = stress building
      < -2% = significant stress — pulls composite score down sharply

    Credit spreads often widen BEFORE equity vol (VIX) spikes, so this
    provides an earlier risk-off warning than VIX alone.
    """

    _REFRESH_SECS = 3600
    _SYMBOL       = 'HYG'

    def __init__(self):
        self._level:  Optional[float] = None
        self._ret_5d: float           = 0.0
        self._fetched: float          = 0.0

    def refresh(self) -> None:
        now = time.time()
        if now - self._fetched < self._REFRESH_SECS:
            return
        try:
            import yfinance as yf
            data   = yf.download(self._SYMBOL, period='1mo', progress=False, auto_adjust=True)
            closes = data['Close'].squeeze().dropna()
            if len(closes) < 6:
                return
            current       = float(closes.iloc[-1])
            five_ago      = float(closes.iloc[-6])
            self._level   = round(current, 2)
            self._ret_5d  = round((current - five_ago) / five_ago * 100, 3)
            self._fetched = now
            log.info(f'[HYG] level={self._level}  5d={self._ret_5d:+.2f}%')
        except ImportError:
            self._fetched = now
        except Exception as exc:
            log.warning(f'[HYG] fetch failed: {exc}')

    @property
    def level(self) -> Optional[float]:
        return self._level

    @property
    def ret_5d(self) -> float:
        """5-day % return. Positive = credit stable / risk-on."""
        return self._ret_5d

    @property
    def is_stressed(self) -> bool:
        """True when HYG has fallen more than 1% over 5 days."""
        return self._ret_5d < -1.0


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
                 vix_backwardation_threshold: float = 0.95,
                 dashboard_url: Optional[str] = None):
        self.vix         = VIXFetcher()
        self.cboe_vol    = CBOEVolFetcher(dashboard_url=dashboard_url)
        self.dxy         = DXYFetcher()
        self.credit      = CreditFetcher()
        self.fomc        = FOMCCalendar()
        self.news        = NewsFetcher()
        self._fomc_win   = fomc_window_hours
        self._vix_thresh = vix_backwardation_threshold

    def refresh(self) -> None:
        self.vix.refresh()
        self.cboe_vol.refresh()
        self.dxy.refresh()
        self.credit.refresh()
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

    def score_inputs(self, pair: str) -> dict:
        """
        Raw inputs needed by compute_regime_score() for this pair.
        Pulled separately so the bot can call without rebuilding snapshot().
        """
        return {
            'pair_vol_pct':  self.cboe_vol.pair_vol_pct(pair),
            'dxy_trend_pct': self.dxy.trend_5d,
            'credit_5d_ret': self.credit.ret_5d,
        }

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
            # DXY
            'dxy_level':       self.dxy.level,
            'dxy_trend_5d':    self.dxy.trend_5d,
            'dxy_rising':      self.dxy.is_rising,
            'dxy_falling':     self.dxy.is_falling,
            # Credit (HYG)
            'hyg_level':       self.credit.level,
            'hyg_5d_ret':      self.credit.ret_5d,
            'credit_stressed': self.credit.is_stressed,
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
        if self.dxy.level:
            arrow = '↑' if self.dxy.is_rising else ('↓' if self.dxy.is_falling else '→')
            parts.append(f'DXY={self.dxy.level:.1f}{arrow}')
        if self.credit.is_stressed:
            parts.append(f'HYG{self.credit.ret_5d:+.1f}%⚠')
        return '  '.join(parts) if parts else 'macro:ok'
