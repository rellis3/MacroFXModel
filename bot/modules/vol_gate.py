from .base import BaseModule, ModuleResult


class VolGateModule(BaseModule):
    """
    Hard gate on high volatility using VIX from FRED data.
    Also computes size_mult for the orchestrator's position sizing.

    VIX > max_vix → BLOCK
    Otherwise     → pass with direction inherited from macro_regime context,
                    so vol_gate contributes a directional vote toward min_agree.

    VIX > 20       → reduce size (vol_high_mult)
    VIX 15-20      → normal size (1.0)
    VIX < 15       → increase size (vol_low_mult)
    """

    name = 'vol_gate'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        fred     = (state.get('regime_snapshot') or {}).get('fred') or {}
        vix_data = fred.get('vix') or {}
        vix      = vix_data.get('value')

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
                reason=f'VIX {vix:.1f} > {max_vix} — HIGH vol block',
                metadata={'vol_regime': 'HIGH', 'vix': vix, 'size_mult': 0.0},
            )

        if vix > 20:
            regime    = 'ELEVATED'
            size_mult = pos_cfg.get('vol_high_mult', 0.7)
            score     = 0.45
        elif vix < 15:
            regime    = 'LOW'
            size_mult = pos_cfg.get('vol_low_mult', 1.2)
            score     = 0.80
        else:
            regime    = 'NORMAL'
            size_mult = 1.0
            score     = 0.65

        # Inherit direction from macro_regime so vol_gate contributes to min_agree count
        inherited_dir = 'NEUTRAL'
        if ctx and 'macro_regime' in ctx and ctx['macro_regime']:
            macro_sig = ctx['macro_regime'].signal
            if macro_sig in ('LONG', 'SHORT'):
                inherited_dir = macro_sig

        return ModuleResult(
            passed=True, signal=inherited_dir, score=score, confidence='MEDIUM',
            reason=f'VIX {vix:.1f} — {regime} · size_mult={size_mult:.1f} · dir={inherited_dir}',
            metadata={'vol_regime': regime, 'vix': vix, 'size_mult': size_mult},
        )
