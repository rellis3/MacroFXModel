from .base import BaseModule, ModuleResult


class MacroRegimeModule(BaseModule):
    """
    Reads signal score and alignment from the dashboard's processed ai_entries.
    Takes the MAXIMUM signalScore across all entries (not first), and determines
    direction from the majority of signalAligned entries.
    """

    name = 'macro_regime'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap      = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        entries   = pair_data.get('entries') or []
        exec_cfg  = config.get('execution') or {}
        min_score = exec_cfg.get('min_macro_score', 5)

        if not entries:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason='No dashboard entries — dashboard may not have loaded this pair',
            )

        # Take max signalScore across all entries (not just first)
        signal_score = max((e.get('signalScore') or 0) for e in entries)

        # Direction from count of aligned entries.
        # signalAligned is set by the browser analysis or by levels.js (signalScore >= 50).
        # When all entries lack the field entirely (old cache), fall back to direction counts.
        aligned_longs  = sum(1 for e in entries if e.get('signalAligned') and e.get('direction') == 'long')
        aligned_shorts = sum(1 for e in entries if e.get('signalAligned') and e.get('direction') == 'short')
        if aligned_longs == 0 and aligned_shorts == 0 and all('signalAligned' not in e for e in entries):
            aligned_longs  = sum(1 for e in entries if e.get('direction') == 'long')
            aligned_shorts = sum(1 for e in entries if e.get('direction') == 'short')

        if aligned_longs > aligned_shorts:
            direction = 'LONG'
        elif aligned_shorts > aligned_longs:
            direction = 'SHORT'
        elif aligned_longs == aligned_shorts and aligned_longs > 0:
            direction = 'NEUTRAL'  # tied — mixed market
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
                reason=f'Score {signal_score}/12 but no clear aligned direction — mixed market',
            )

        conf = 'HIGH' if signal_score >= 8 else 'MEDIUM' if signal_score >= 5 else 'LOW'
        return ModuleResult(
            passed=True, signal=direction, score=signal_score / 12, confidence=conf,
            reason=f'Macro {direction} · score {signal_score}/12 · {aligned_longs}L/{aligned_shorts}S aligned',
            metadata={'signal_score': signal_score, 'direction': direction,
                      'aligned_longs': aligned_longs, 'aligned_shorts': aligned_shorts},
        )
