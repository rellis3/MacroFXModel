from .base import BaseModule, ModuleResult


class MacroRegimeModule(BaseModule):
    """
    Reads signal score and alignment from the dashboard's processed ai_entries.
    The dashboard's signal engine (signal.js) already computed a 0–12 score
    and an alignment flag for each entry. This module treats that as the
    pair-level macro verdict — the bot does not recompute it.
    """

    name = 'macro_regime'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        entries = pair_data.get('entries') or []
        exec_cfg = config.get('execution') or {}
        min_score = exec_cfg.get('min_macro_score', 5)

        if not entries:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason='No dashboard entries — dashboard may not have loaded this pair',
            )

        # signalScore is pair-level; take from the first available entry
        signal_score = entries[0].get('signalScore') or 0

        # Determine macro direction from entries with signalAligned=True
        aligned_longs  = [e for e in entries if e.get('signalAligned') and e.get('direction') == 'long']
        aligned_shorts = [e for e in entries if e.get('signalAligned') and e.get('direction') == 'short']

        if aligned_longs:
            direction = 'LONG'
        elif aligned_shorts:
            direction = 'SHORT'
        else:
            direction = 'NEUTRAL'

        if signal_score < min_score:
            return ModuleResult(
                passed=False, signal=direction, score=signal_score / 12,
                confidence='LOW',
                reason=f'Signal score {signal_score}/12 below min {min_score} — weak macro',
            )

        if direction == 'NEUTRAL':
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=signal_score / 12,
                confidence='MEDIUM',
                reason=f'Score {signal_score}/12 but no aligned entries — mixed/flat market',
            )

        conf = 'HIGH' if signal_score >= 8 else 'MEDIUM' if signal_score >= 5 else 'LOW'
        return ModuleResult(
            passed=True, signal=direction, score=signal_score / 12, confidence=conf,
            reason=f'Macro {direction} · signal score {signal_score}/12',
            metadata={'signal_score': signal_score, 'direction': direction},
        )
