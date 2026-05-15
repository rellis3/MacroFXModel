from .base import BaseModule, ModuleResult


class ConfluenceModule(BaseModule):
    """
    Selects the highest-quality entry from the dashboard's processed level list.
    Filters by min star rating and, if macro_regime has voted, by direction.
    Passes the chosen entry to downstream modules (OI walls, SL/TP engine) via metadata.
    """

    name = 'confluence'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        entries = pair_data.get('entries') or []
        exec_cfg = config.get('execution') or {}
        min_stars = exec_cfg.get('min_stars', 3)

        if not entries:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason=f'No entries from dashboard for {pair}',
            )

        # Filter: minimum star rating
        filtered = [e for e in entries if (e.get('totalStars') or 0) >= min_stars]

        # Filter: macro direction if voted
        macro_signal = None
        if ctx and 'macro_regime' in ctx and ctx['macro_regime']:
            macro_signal = ctx['macro_regime'].signal  # LONG | SHORT | NEUTRAL

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

        # Pick best: highest stars first, then highest signalScore
        best = max(filtered, key=lambda e: (e.get('totalStars') or 0, e.get('signalScore') or 0))
        direction_str = 'LONG' if best.get('direction') == 'long' else 'SHORT'
        stars = best.get('totalStars') or 0
        conf = 'HIGH' if stars >= 4 else 'MEDIUM'

        return ModuleResult(
            passed=True, signal=direction_str, score=min(stars / 5, 1.0), confidence=conf,
            reason=f'{stars}★ entry at {best.get("price", "?")} — {direction_str}',
            metadata={'entry': best},
        )
