from .base import BaseModule, ModuleResult
from utils.config_helpers import resolve_grade_thresholds

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}


class ConfluenceModule(BaseModule):
    """
    Selects the highest-quality entry from the dashboard's processed level list.

    Filtering order:
      1. Min star rating (derived from min_grade config via resolve_grade_thresholds)
      2. Macro direction (if macro_regime voted LONG or SHORT)
      3. Proximity — entry must be within tol_pips of current live price
         (tol_pips comes from state['_tol_pips'][pair] set by pre_screen,
          falls back to config prox_pips)
    """

    name = 'confluence'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap      = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        entries   = pair_data.get('entries') or []
        exec_cfg              = config.get('execution') or {}
        _, min_stars          = resolve_grade_thresholds(exec_cfg)

        if not entries:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason=f'No entries from dashboard for {pair}',
            )

        # ── 1. Filter by min star rating ─────────────────────────────────────
        filtered = [e for e in entries if (e.get('totalStars') or 0) >= min_stars]

        # ── 2. Filter by macro direction ──────────────────────────────────────
        macro_signal = None
        if ctx and 'macro_regime' in ctx and ctx['macro_regime']:
            macro_signal = ctx['macro_regime'].signal

        if macro_signal in ('LONG', 'SHORT'):
            target_dir = 'long' if macro_signal == 'LONG' else 'short'
            filtered = [e for e in filtered if e.get('direction') == target_dir]

        if not filtered:
            reason = f'No entries ≥ {min_stars}★'
            if macro_signal in ('LONG', 'SHORT'):
                reason += f' in macro-aligned {macro_signal} direction'
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason=reason,
            )

        # ── 3. Proximity check ────────────────────────────────────────────────
        live_price = (state.get('_live_prices') or {}).get(pair)
        if live_price:
            # Use ATR-derived tol from pre_screen if available, else config prox_pips
            tol_pips_map = state.get('_tol_pips') or {}
            tol_pips     = tol_pips_map.get(pair)
            if tol_pips is None:
                prox_cfg  = exec_cfg.get('prox_pips', 8)
                tol_pips  = (
                    prox_cfg.get(pair) or prox_cfg.get('default', 8)
                    if isinstance(prox_cfg, dict) else prox_cfg
                )

            pip_size  = _PIP_SIZES.get(pair, 0.0001)
            tol_dist  = tol_pips * pip_size

            in_range = [e for e in filtered if abs((e.get('price') or 0) - live_price) <= tol_dist]

            if not in_range:
                unit    = 'pips' if pip_size < 0.1 else 'pts'
                closest = min(filtered, key=lambda e: abs((e.get('price') or 0) - live_price))
                closest_dist = abs((closest.get('price') or 0) - live_price) / pip_size
                return ModuleResult(
                    passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                    reason=(
                        f'No entries within {tol_pips:.1f} {unit} of live {live_price} — '
                        f'nearest is {closest_dist:.1f} {unit} away at {closest.get("price")}'
                    ),
                )
            filtered = in_range

        # ── 4. Pick best: stars first, then signalScore ───────────────────────
        best      = max(filtered, key=lambda e: (e.get('totalStars') or 0, e.get('signalScore') or 0))
        direction = 'LONG' if best.get('direction') == 'long' else 'SHORT'
        stars     = best.get('totalStars') or 0
        conf      = 'HIGH' if stars >= 4 else 'MEDIUM'

        dist_note = ''
        if live_price:
            pip_size  = _PIP_SIZES.get(pair, 0.0001)
            dist_pips = abs((best.get('price') or 0) - live_price) / pip_size
            unit      = 'pips' if pip_size < 0.1 else 'pts'
            dist_note = f'  {dist_pips:.1f}{unit} from live'

        return ModuleResult(
            passed=True, signal=direction, score=min(stars / 5, 1.0), confidence=conf,
            reason=f'{stars}★ at {best.get("price", "?")} — {direction}{dist_note}',
            metadata={'entry': best},
        )
