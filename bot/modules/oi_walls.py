from .base import BaseModule, ModuleResult

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}


class OIWallsModule(BaseModule):
    """
    Blocks entries that are heading directly into an OI call or put wall.
    OI data is entered manually into the dashboard and stored in oi_store KV.

    Long entries blocked if call wall is within max_sl_pips above entry.
    Short entries blocked if put wall is within max_sl_pips below entry.
    """

    name = 'oi_walls'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        oi = pair_data.get('oi')

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
                reason='No entry selected yet — OI wall check skipped',
            )

        price = entry.get('price') or 0
        direction = entry.get('direction') or 'long'
        call_wall = oi.get('callWall') or 0
        put_wall  = oi.get('putWall')  or 0
        pip_size  = _PIP_SIZES.get(pair, 0.0001)
        max_sl    = (config.get('sl_tp') or {}).get('max_sl_pips', 50)

        if direction == 'long' and call_wall > price:
            dist_pips = (call_wall - price) / pip_size
            if dist_pips < max_sl:
                return ModuleResult(
                    passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                    reason=f'Long blocked — call wall {call_wall} is {dist_pips:.0f} pips above entry {price}',
                    metadata={'call_wall': call_wall, 'put_wall': put_wall},
                )

        if direction == 'short' and put_wall > 0 and price > put_wall:
            dist_pips = (price - put_wall) / pip_size
            if dist_pips < max_sl:
                return ModuleResult(
                    passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                    reason=f'Short blocked — put wall {put_wall} is {dist_pips:.0f} pips below entry {price}',
                    metadata={'call_wall': call_wall, 'put_wall': put_wall},
                )

        signal = 'LONG' if direction == 'long' else 'SHORT'
        return ModuleResult(
            passed=True, signal=signal, score=0.8, confidence='MEDIUM',
            reason=f'OI walls clear · call={call_wall} put={put_wall} max_pain={oi.get("maxPain", "?")}',
            metadata={'call_wall': call_wall, 'put_wall': put_wall, 'max_pain': oi.get('maxPain', 0)},
        )
