"""
MacroFX Dashboard context client.

Fetches three categories of slow-moving data from the dashboard API / KV store,
refreshed every CONTEXT_REFRESH_MIN minutes.  All failures are silent — the bot
runs with sensible defaults when the dashboard is unreachable.

Data sources
────────────
hmm5m_trained_params  (KV)  Baum-Welch emission params per pair, written by
                             the training script.  Updated when you click
                             "Train HMM" in the dashboard.

hmm5m_macro_context   (KV)  FRED macro overlay: VIX, HY spread, yield curve
                             → combined confidence multiplier (0.45–1.15).
                             Updated each morning after the training cron runs
                             (typically 07:00–08:00 UTC).

/api/state                   Full regime snapshot — used to extract per-pair
                             COT (CFTC leveraged-fund positioning) and OI walls
                             (call wall, put wall, max pain) for the configured
                             pair.  Dashboard syncs this every 5 minutes.

Usage
─────
    ctx = DashboardClient()
    ctx.refresh()                        # call at startup + periodically

    # Pass to regime engine:
    snap = engine.update(bars, ctx.trained_params, ctx.macro_ctx)

    # Lot-size multipliers:
    macro_mult = snap.macro_mult         # already baked into the snapshot
    cot_mult   = ctx.cot_direction_mult('BUY')

    # OI wall hard-block:
    blocked, reason = ctx.oi_wall_block('BUY', entry_price, sl_pips)
"""

import logging
import time
from typing import Optional

import requests

import config

log = logging.getLogger(__name__)

DASHBOARD_URL = config.DASHBOARD_URL
_TIMEOUT      = 15   # seconds per request


# ── COT directional multiplier ────────────────────────────────────────────────

def _cot_mult(cot: dict, direction: str) -> float:
    """
    Returns a lot-size multiplier based on COT alignment:
      Aligned  → COT_ALIGNED_MULT  (default 1.00 — full size)
      Neutral  → COT_NEUTRAL_MULT  (default 0.85 — slight reduction)
      Opposed  → COT_OPPOSED_MULT  (default 0.65 — meaningful reduction)
    """
    if not cot:
        return config.COT_NEUTRAL_MULT   # no data = neutral

    lev_net     = cot.get('levNet', 0) or 0
    lev_net_chg = cot.get('levNetChg', 0) or 0

    # Determine COT lean
    if lev_net > 0:
        cot_lean = 'LONG'
    elif lev_net < 0:
        cot_lean = 'SHORT'
    else:
        return config.COT_NEUTRAL_MULT

    # Momentum (is positioning growing or shrinking in that direction?)
    momentum_aligned = (cot_lean == 'LONG' and lev_net_chg >= 0) or \
                       (cot_lean == 'SHORT' and lev_net_chg <= 0)

    if cot_lean == direction:
        return config.COT_ALIGNED_MULT if momentum_aligned else config.COT_NEUTRAL_MULT
    else:
        return config.COT_OPPOSED_MULT


# ── OI wall hard-block ────────────────────────────────────────────────────────

def _oi_wall_block(oi: dict, direction: str, price: float, sl_pips: float) -> tuple[bool, str]:
    """
    Returns (blocked, reason).

    BUY  is blocked if a call wall is within OI_WALL_PIPS above entry.
    SELL is blocked if a put  wall is within OI_WALL_PIPS below entry.

    Uses OI_WALL_PIPS threshold (default 15), independent of the current SL.
    """
    if not oi or price <= 0:
        return False, ''

    pip_size   = config.PIP_SIZE
    wall_pips  = config.OI_WALL_PIPS
    call_wall  = oi.get('callWall', 0) or 0
    put_wall   = oi.get('putWall', 0)  or 0

    if direction == 'BUY' and call_wall > price:
        dist = (call_wall - price) / pip_size
        if dist < wall_pips:
            return True, f'Call wall {call_wall} is {dist:.0f}p above entry (< {wall_pips}p threshold)'

    if direction == 'SELL' and put_wall > 0 and price > put_wall:
        dist = (price - put_wall) / pip_size
        if dist < wall_pips:
            return True, f'Put wall {put_wall} is {dist:.0f}p below entry (< {wall_pips}p threshold)'

    return False, ''


# ── Dashboard client ──────────────────────────────────────────────────────────

class DashboardClient:
    """Caches slow-moving contextual data fetched from the dashboard."""

    def __init__(self):
        self.trained_params: Optional[dict] = None    # keyed by symbol
        self.macro_ctx:      Optional[dict] = None    # { mult, vix, hySpread, curve, label }
        self._cot:           dict            = {}
        self._oi:            dict            = {}
        self._last_refresh:  float           = 0.0

    # ── Public API ─────────────────────────────────────────────────────────────

    def refresh_if_due(self) -> None:
        """Call every tick — only fetches when CONTEXT_REFRESH_MIN has elapsed."""
        elapsed_m = (time.time() - self._last_refresh) / 60
        if elapsed_m >= config.CONTEXT_REFRESH_MIN:
            self.refresh()

    def refresh(self) -> None:
        """Fetches all three data sources.  Never raises."""
        log.info('Dashboard context refresh starting…')
        self._fetch_trained_params()
        self._fetch_macro_context()
        self._fetch_state()
        self._last_refresh = time.time()
        log.info(
            f'Dashboard context refreshed  '
            f'macro={self.macro_label}({self.macro_mult:.2f})  '
            f'learned={"yes" if self.trained_params else "no"}  '
            f'cot_net={self._cot.get("levNet", "n/a")}  '
            f'call_wall={self._oi.get("callWall", "n/a")}'
        )

    @property
    def macro_mult(self) -> float:
        return (self.macro_ctx or {}).get('mult', 1.0)

    @property
    def macro_label(self) -> str:
        return (self.macro_ctx or {}).get('label', 'UNKNOWN')

    @property
    def vix(self) -> Optional[float]:
        return (self.macro_ctx or {}).get('vix')

    def cot_direction_mult(self, direction: str) -> float:
        """Returns lot-size multiplier based on COT alignment with direction ('BUY'/'SELL')."""
        return _cot_mult(self._cot, direction)

    def oi_wall_block(self, direction: str, price: float, sl_pips: float) -> tuple[bool, str]:
        """Returns (blocked, reason) for an OI wall hard-block check."""
        return _oi_wall_block(self._oi, direction, price, sl_pips)

    def cot_summary(self) -> str:
        """One-line COT summary for logging."""
        c = self._cot
        if not c:
            return 'COT: n/a'
        return (
            f'COT: levNet={c.get("levNet", "?"):+}  '
            f'chg={c.get("levNetChg", "?"):+}  '
            f'ratio={c.get("grossRatio", "?")}'
        )

    def oi_summary(self) -> str:
        """One-line OI summary for logging."""
        o = self._oi
        if not o:
            return 'OI: n/a'
        return (
            f'OI: call={o.get("callWall", "?")}  '
            f'put={o.get("putWall", "?")}  '
            f'pain={o.get("maxPain", "?")}'
        )

    # ── Internal fetchers ──────────────────────────────────────────────────────

    def _kv_get(self, key: str) -> Optional[dict]:
        """Fetches a KV key from the dashboard.  Returns parsed data or None."""
        try:
            r = requests.get(
                f'{DASHBOARD_URL}/api/kv/get',
                params={'key': key},
                timeout=_TIMEOUT,
            )
            if r.status_code != 200:
                return None
            j = r.json()
            if j.get('miss') or not j.get('data'):
                return None
            return j['data']
        except Exception as exc:
            log.debug(f'KV get {key!r} failed: {exc}')
            return None

    def _fetch_trained_params(self) -> None:
        data = self._kv_get('hmm5m_trained_params')
        if data:
            self.trained_params = data
            sym = config.PAIR
            if sym in data:
                p = data[sym]
                log.info(
                    f'Trained params loaded for {sym}  '
                    f'learnedAt={p.get("learnedAt", "?")}  '
                    f'nBars={p.get("nBars", "?")}'
                )
            else:
                log.info(f'Trained params loaded but {sym} not present — using defaults')
        else:
            log.debug('hmm5m_trained_params not in KV — using HMM defaults')

    def _fetch_macro_context(self) -> None:
        data = self._kv_get('hmm5m_macro_context')
        if data:
            self.macro_ctx = data
            log.info(
                f'Macro context: VIX={data.get("vix")}  '
                f'HY={data.get("hySpread")}  '
                f'curve={data.get("curve")}  '
                f'mult={data.get("mult")}  '
                f'label={data.get("label")}'
            )
        else:
            log.debug('hmm5m_macro_context not in KV — macro overlay disabled')

    def _fetch_state(self) -> None:
        """Extracts per-pair COT and OI data from /api/state."""
        try:
            r = requests.get(f'{DASHBOARD_URL}/api/state', timeout=_TIMEOUT)
            if r.status_code != 200:
                return
            state     = r.json()
            snap      = state.get('regime_snapshot') or {}
            pair_data = (snap.get('pairs') or {}).get(config.PAIR) or {}

            cot = pair_data.get('cot') or {}
            oi  = pair_data.get('oi')  or {}

            if cot:
                self._cot = cot
            if oi:
                self._oi  = oi

        except Exception as exc:
            log.debug(f'State fetch failed: {exc}')
