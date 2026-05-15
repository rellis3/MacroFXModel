from .base import BaseModule, ModuleResult


class VolGateModule(BaseModule):
    """
    Hard gate on high volatility using VIX from FRED data.
    Also computes size_mult for the orchestrator's position sizing.

    VIX > max_vix  → BLOCK (no new entries)
    VIX 20–max_vix → NORMAL sizing
    VIX 15–20      → NORMAL sizing
    VIX < 15       → LOW vol, increase size
    """

    name = 'vol_gate'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        fred = (state.get('regime_snapshot') or {}).get('fred') or {}
        vix_data = fred.get('vix') or {}
        vix = vix_data.get('value')

        if vix is None:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='VIX unavailable — no vol block applied',
                metadata={'vol_regime': 'UNKNOWN', 'size_mult': 1.0},
            )

        max_vix = (config.get('vol_gate') or {}).get('max_vix', 30)
        pos_cfg = config.get('position') or {}

        if vix > max_vix:
            return ModuleResult(
                passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                reason=f'VIX {vix:.1f} > {max_vix} hard cap — HIGH vol block',
                metadata={'vol_regime': 'HIGH', 'vix': vix, 'size_mult': 0.0},
            )

        if vix > 20:
            regime = 'NORMAL'
            size_mult = pos_cfg.get('vol_high_mult', 0.7)
            score = 0.45
        elif vix < 15:
            regime = 'LOW'
            size_mult = pos_cfg.get('vol_low_mult', 1.2)
            score = 0.80
        else:
            regime = 'NORMAL'
            size_mult = 1.0
            score = 0.65

        return ModuleResult(
            passed=True, signal='NEUTRAL', score=score, confidence='MEDIUM',
            reason=f'VIX {vix:.1f} — {regime} vol · size_mult={size_mult:.1f}',
            metadata={'vol_regime': regime, 'vix': vix, 'size_mult': size_mult},
        )
