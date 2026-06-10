from .base import BaseModule, ModuleResult

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}


class OIWallsModule(BaseModule):
    """
    Blocks entries heading directly into an opposing OI wall.

    Long  blocked if call wall is within oi_wall_pips ABOVE entry price.
    Short blocked if put  wall is within oi_wall_pips BELOW entry price.

    Uses a dedicated oi_wall_pips threshold (default 15), NOT max_sl_pips.
    A call wall 50 pips away is not a blocker — it might be the TP.
    A call wall 8 pips away is structural resistance and should block.
    """

    name = 'oi_walls'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap      = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        oi        = pair_data.get('oi')

        if not oi:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='No OI data — wall check skipped',
            )

        entry = None
        if ctx and 'confluence' in ctx and ctx['confluence']:
            entry = ctx['confluence'].metadata.get('entry')

        if not entry:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='No entry selected — OI wall check skipped',
            )

        price       = entry.get('price') or 0
        direction   = entry.get('direction') or 'long'
        pip_size    = _PIP_SIZES.get(pair, 0.0001)
        wall_thresh = (config.get('oi_walls') or {}).get('oi_wall_pips', 15)

        # Build strike lists from ranked arrays (new format) or fall back to single values
        raw_cw = oi.get('callWalls') or []
        raw_pw = oi.get('putWalls')  or []
        call_strikes = [w['strike'] for w in raw_cw if w.get('strike')] if raw_cw else (
            [oi['callWall']] if oi.get('callWall') else [])
        put_strikes  = [w['strike'] for w in raw_pw if w.get('strike')] if raw_pw else (
            [oi['putWall']]  if oi.get('putWall')  else [])
        # Primary walls for logging/metadata
        call_wall = call_strikes[0] if call_strikes else 0
        put_wall  = put_strikes[0]  if put_strikes  else 0

        if direction == 'long' and call_strikes:
            walls_above = sorted([s for s in call_strikes if s > price])
            if walls_above:
                nearest = walls_above[0]
                dist_pips = (nearest - price) / pip_size
                if dist_pips < wall_thresh:
                    return ModuleResult(
                        passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                        reason=f'Long blocked — call wall {nearest} is {dist_pips:.0f}p above entry (< {wall_thresh}p threshold)',
                        metadata={'call_wall': nearest, 'put_wall': put_wall},
                    )

        if direction == 'short' and put_strikes:
            walls_below = sorted([s for s in put_strikes if s < price], reverse=True)
            if walls_below:
                nearest = walls_below[0]
                dist_pips = (price - nearest) / pip_size
                if dist_pips < wall_thresh:
                    return ModuleResult(
                        passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                        reason=f'Short blocked — put wall {nearest} is {dist_pips:.0f}p below entry (< {wall_thresh}p threshold)',
                        metadata={'call_wall': call_wall, 'put_wall': nearest},
                    )

        signal   = 'LONG' if direction == 'long' else 'SHORT'
        max_pain = oi.get('maxPain', 0)
        score = 0.85 if (
            (direction == 'long'  and max_pain and max_pain > price) or
            (direction == 'short' and max_pain and max_pain < price)
        ) else 0.70

        return ModuleResult(
            passed=True, signal=signal, score=score, confidence='MEDIUM',
            reason=f'OI walls clear · call={call_wall} put={put_wall} max_pain={max_pain}',
            metadata={'call_wall': call_wall, 'put_wall': put_wall, 'max_pain': max_pain},
        )
